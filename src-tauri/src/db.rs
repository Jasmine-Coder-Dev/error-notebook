//! SQLite 数据层（rusqlite bundled）。
//! schema 与 Python 版 server/db.py 逐字段一致，打开同一个数据库文件，数据零迁移。
//! 数据目录：~/.cuotiji（与 Python 版一致）。

use std::path::PathBuf;

use rand::Rng;
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Map, Value};

pub const GRADES: &[&str] = &[
    "一年级", "二年级", "三年级", "四年级", "五年级", "六年级",
    "七年级", "八年级", "九年级", "高一", "高二", "高三",
];
pub const TERMS: &[&str] = &["上", "下"];
pub const SUBJECTS: &[&str] = &["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "政治"];
pub const MASTERY: &[&str] = &["未掌握", "复习中", "已掌握"];
pub const STAGES: &[&str] = &["小学", "初中", "高中", "大学", "职业考试", "其他"];

/// 按 grade 推断学段（迁移回填 & 未填学段时的兜底）。
pub fn stage_of_grade(grade: &str) -> &'static str {
    match grade {
        "一年级" | "二年级" | "三年级" | "四年级" | "五年级" | "六年级" => "小学",
        "七年级" | "八年级" | "九年级" => "初中",
        "高一" | "高二" | "高三" => "高中",
        _ => "其他",
    }
}

/// 学段是否显示学期（仅 K12）。
pub fn has_term(stage: &str) -> bool {
    matches!(stage, "小学" | "初中" | "高中")
}

/// 题型词表（按学段，种子可自定义扩充）。
pub fn qtype_vocab(stage: &str) -> &'static [&'static str] {
    match stage {
        "小学" => &["选择", "填空", "判断", "计算", "应用题", "操作作图", "口算"],
        "初中" | "高中" => &["选择", "填空", "判断", "计算", "应用题", "实验探究", "作图证明", "阅读理解", "作文", "听力"],
        "大学" => &["选择", "填空", "计算证明", "简答", "论述", "案例分析", "翻译", "作文"],
        "职业考试" => &["单选", "多选", "判断", "不定项选择", "计算分析", "简答", "综合题", "案例分析", "申论"],
        _ => &["选择", "填空", "判断", "计算", "简答", "其他"],
    }
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS questions (
    id              TEXT PRIMARY KEY,
    text            TEXT NOT NULL DEFAULT '',
    answer          TEXT NOT NULL DEFAULT '',
    grade           TEXT NOT NULL DEFAULT '',
    term            TEXT NOT NULL DEFAULT '',
    subject         TEXT NOT NULL DEFAULT '',
    knowledge_points TEXT NOT NULL DEFAULT '[]',
    is_wrong        INTEGER NOT NULL DEFAULT 0,
    wrong_reason    TEXT NOT NULL DEFAULT '',
    mastery         TEXT NOT NULL DEFAULT '未掌握',
    source_file     TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT '',
    stage           TEXT NOT NULL DEFAULT '',
    qtype           TEXT NOT NULL DEFAULT '',
    images          TEXT NOT NULL DEFAULT '[]',
    next_review_at  TEXT NOT NULL DEFAULT '',
    review_interval INTEGER NOT NULL DEFAULT 0
);
";

/// 列名列表（SELECT 显式列出，避免新增列后索引错位）。
const COLUMNS: &str = "id, text, answer, grade, term, subject, knowledge_points, is_wrong, wrong_reason, mastery, source_file, created_at, stage, qtype, images, next_review_at, review_interval";

/// 数据目录：~/.cuotiji（与 Python 版一致）。
pub fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("CUOTIJI_DATA_DIR") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".cuotiji")
}

pub fn db_path() -> PathBuf {
    data_dir().join("cuotiji.db")
}

pub fn conn() -> Result<Connection, String> {
    std::fs::create_dir_all(data_dir()).map_err(|e| e.to_string())?;
    let c = Connection::open(db_path()).map_err(|e| e.to_string())?;
    c.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
    migrate(&c)?;
    Ok(c)
}

/// 一期迁移：补 stage / qtype 两列并按 grade 回填学段（幂等，旧数据零破坏）。
fn migrate(c: &Connection) -> Result<(), String> {
    let cols: Vec<String> = c
        .prepare("PRAGMA table_info(questions)")
        .and_then(|mut stmt| {
            stmt.query_map([], |r| r.get::<_, String>(1))
                .map(|rows| rows.collect::<Result<Vec<_>, _>>())
        })
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    if !cols.iter().any(|c| c == "stage") {
        c.execute("ALTER TABLE questions ADD COLUMN stage TEXT NOT NULL DEFAULT ''", [])
            .map_err(|e| e.to_string())?;
    }
    if !cols.iter().any(|c| c == "qtype") {
        c.execute("ALTER TABLE questions ADD COLUMN qtype TEXT NOT NULL DEFAULT ''", [])
            .map_err(|e| e.to_string())?;
    }
    // 二期/三期迁移：图片题干 + 复习排期（幂等）
    if !cols.iter().any(|c| c == "images") {
        c.execute("ALTER TABLE questions ADD COLUMN images TEXT NOT NULL DEFAULT '[]'", [])
            .map_err(|e| e.to_string())?;
    }
    if !cols.iter().any(|c| c == "next_review_at") {
        c.execute("ALTER TABLE questions ADD COLUMN next_review_at TEXT NOT NULL DEFAULT ''", [])
            .map_err(|e| e.to_string())?;
    }
    if !cols.iter().any(|c| c == "review_interval") {
        c.execute("ALTER TABLE questions ADD COLUMN review_interval INTEGER NOT NULL DEFAULT 0", [])
            .map_err(|e| e.to_string())?;
    }
    // 回填：空 stage 按 grade 推断
    c.execute(
        "UPDATE questions SET stage = CASE
            WHEN grade IN ('一年级','二年级','三年级','四年级','五年级','六年级') THEN '小学'
            WHEN grade IN ('七年级','八年级','九年级') THEN '初中'
            WHEN grade IN ('高一','高二','高三') THEN '高中'
            ELSE '其他' END
         WHERE stage = ''",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 对齐 Python gen_id：毫秒时间戳 hex + 4 字节随机 hex（共 8 位）。
pub fn gen_id() -> String {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut rng = rand::thread_rng();
    let mut bytes = [0u8; 4];
    for b in bytes.iter_mut() {
        *b = rng.gen();
    }
    format!("{:x}{}", millis, hex_encode(&bytes))
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// 字段规范化（受众扩展一期：stage/qtype；grade/subject 语义升级为分类一/二，支持自由输入）。
pub fn normalize(data: &Map<String, Value>) -> Map<String, Value> {
    let get_s = |k: &str| -> Option<String> {
        data.get(k).and_then(|v| {
            if v.is_null() { None } else { Some(v.as_str().unwrap_or("").to_string()) }
        }).filter(|s| !s.is_empty())
    };
    // knowledgePoints 兼容 snake_case（导入旧导出文件）
    let kp_raw = data.get("knowledgePoints").or_else(|| data.get("knowledge_points"));
    let kps: Vec<Value> = match kp_raw {
        Some(Value::String(s)) => Regex::new(r"[,，、]")
            .unwrap()
            .split(s)
            .map(|x| x.trim())
            .filter(|x| !x.is_empty())
            .map(|x| json!(x))
            .collect(),
        Some(Value::Array(arr)) => arr
            .iter()
            .map(|v| v.as_str().unwrap_or("").trim().to_string())
            .filter(|s| !s.is_empty())
            .map(|s| json!(s))
            .collect(),
        _ => vec![],
    };

    let grade = get_s("grade").unwrap_or_default();
    // 学段：合法值保留；否则按 grade 推断；兜底「其他」
    let stage = match get_s("stage") {
        Some(v) if STAGES.contains(&v.as_str()) => v,
        _ => stage_of_grade(&grade).to_string(),
    };
    // 学期：仅 K12 学段保留；大学/职业考试等存空
    let term = if has_term(&stage) { get_s("term").unwrap_or_default() } else { String::new() };
    let subject = get_s("subject").unwrap_or_default();
    let mastery = match get_s("mastery") {
        Some(v) if MASTERY.contains(&v.as_str()) => json!(v),
        _ => json!("未掌握"),
    };
    let is_wrong = data
        .get("isWrong")
        .or_else(|| data.get("is_wrong"))
        .map(|v| v.as_bool().unwrap_or(false))
        .unwrap_or(false);
    let created = get_s("createdAt")
        .or_else(|| get_s("created_at"))
        .unwrap_or_else(now_iso);
    let id = get_s("id").unwrap_or_else(gen_id);

    // 图片题干：文件名白名单校验（防目录穿越），至多 6 张
    let images: Vec<Value> = match data.get("images") {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str())
            .filter(|s| is_safe_image_name(s))
            .take(6)
            .map(|s| json!(s))
            .collect(),
        _ => vec![],
    };

    // 复习排期：未掌握的题若无排期则排到明天；已掌握清空排期
    let mastery_str = mastery.as_str().unwrap_or("未掌握").to_string();
    let (next_review_at, review_interval) = if mastery_str == "已掌握" {
        (String::new(), 0i64)
    } else {
        let existing_at = get_s("nextReviewAt").or_else(|| get_s("next_review_at")).unwrap_or_default();
        let existing_iv = data.get("reviewInterval").or_else(|| data.get("review_interval"))
            .and_then(|v| v.as_i64()).unwrap_or(0);
        if !existing_at.is_empty() {
            (existing_at, existing_iv)
        } else {
            (date_after_days(1), 0)
        }
    };

    let mut m = Map::new();
    m.insert("id".into(), json!(id));
    m.insert("text".into(), json!(get_s("text").unwrap_or_default()));
    m.insert("answer".into(), json!(get_s("answer").unwrap_or_default()));
    m.insert("grade".into(), json!(grade));
    m.insert("term".into(), json!(term));
    m.insert("subject".into(), json!(subject));
    m.insert("knowledgePoints".into(), json!(kps));
    m.insert("isWrong".into(), json!(is_wrong));
    m.insert("wrongReason".into(), json!(get_s("wrongReason").or_else(|| get_s("wrong_reason")).unwrap_or_default()));
    m.insert("mastery".into(), json!(mastery_str));
    m.insert("sourceFile".into(), json!(get_s("sourceFile").or_else(|| get_s("source_file")).unwrap_or_default()));
    m.insert("createdAt".into(), json!(created));
    m.insert("stage".into(), json!(stage));
    m.insert("qtype".into(), json!(get_s("qtype").unwrap_or_default()));
    m.insert("images".into(), json!(images));
    m.insert("nextReviewAt".into(), json!(next_review_at));
    m.insert("reviewInterval".into(), json!(review_interval));
    m
}

/// 图片文件名安全校验：仅允许 [A-Za-z0-9_.-]，不得以 . 开头、不含 ..，扩展名限图片。
pub fn is_safe_image_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 100 || name.starts_with('.') || name.contains("..") {
        return false;
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-') {
        return false;
    }
    matches!(name.rsplit('.').next(), Some(ext) if matches!(ext, "png" | "jpg" | "jpeg" | "webp"))
}

/// 今天 + n 天的日期（YYYY-MM-DD）。
pub fn date_after_days(n: i64) -> String {
    use time::ext::NumericalDuration;
    use time::macros::format_description;
    let fmt = format_description!("[year]-[month]-[day]");
    let day = time::OffsetDateTime::now_local()
        .unwrap_or_else(|_| time::OffsetDateTime::now_utc())
        .date();
    (day + n.days()).format(&fmt).unwrap_or_default()
}

/// 对齐 Python datetime.now().isoformat(timespec='seconds')：本地时间，秒精度。
pub fn now_iso() -> String {
    use time::macros::format_description;
    use time::OffsetDateTime;
    const FMT: &[time::format_description::FormatItem<'static>] =
        format_description!("[year]-[month]-[day]T[hour]:[minute]:[second]");
    OffsetDateTime::now_local()
        .unwrap_or_else(|_| OffsetDateTime::now_utc())
        .format(FMT)
        .unwrap_or_default()
}

/// 行 → camelCase JSON（按列名取，新增列安全）。
pub fn row_to_q(row: &rusqlite::Row) -> rusqlite::Result<Map<String, Value>> {
    let get = |name: &str| -> rusqlite::Result<String> { row.get(name) };
    let kps: Vec<Value> = serde_json::from_str(&get("knowledge_points")?)
        .unwrap_or_else(|_| vec![]);
    let mut m = Map::new();
    m.insert("id".into(), json!(get("id")?));
    m.insert("text".into(), json!(get("text")?));
    m.insert("answer".into(), json!(get("answer")?));
    m.insert("grade".into(), json!(get("grade")?));
    m.insert("term".into(), json!(get("term")?));
    m.insert("subject".into(), json!(get("subject")?));
    m.insert("knowledgePoints".into(), json!(kps));
    m.insert("isWrong".into(), json!(row.get::<&str, i32>("is_wrong")? != 0));
    m.insert("wrongReason".into(), json!(get("wrong_reason")?));
    m.insert("mastery".into(), json!(get("mastery")?));
    m.insert("sourceFile".into(), json!(get("source_file")?));
    m.insert("createdAt".into(), json!(get("created_at")?));
    m.insert("stage".into(), json!(get("stage")?));
    m.insert("qtype".into(), json!(get("qtype")?));
    let images: Vec<Value> = serde_json::from_str(&get("images")?)
        .unwrap_or_else(|_| vec![]);
    m.insert("images".into(), json!(images));
    m.insert("nextReviewAt".into(), json!(get("next_review_at")?));
    m.insert("reviewInterval".into(), json!(row.get::<&str, i64>("review_interval")?));
    Ok(m)
}

#[derive(Default)]
pub struct Filters {
    pub stage: String,
    pub grade: String,
    pub term: String,
    pub subject: String,
    pub kp: String,
    pub qtype: String,
    pub mastery: String,
    pub only_wrong: bool,
    pub keyword: String,
}

/// 组合筛选：stage/grade/term/subject/kp/qtype/mastery/onlyWrong/keyword，ORDER BY rowid。
pub fn list_questions(f: &Filters) -> Result<Vec<Map<String, Value>>, String> {
    let mut cond: Vec<String> = vec![];
    let mut args: Vec<String> = vec![];
    if !f.stage.is_empty() { cond.push("stage = ?".into()); args.push(f.stage.clone()); }
    if !f.grade.is_empty() { cond.push("grade = ?".into()); args.push(f.grade.clone()); }
    if !f.term.is_empty() { cond.push("term = ?".into()); args.push(f.term.clone()); }
    if !f.subject.is_empty() { cond.push("subject = ?".into()); args.push(f.subject.clone()); }
    if !f.kp.is_empty() { cond.push("knowledge_points LIKE ?".into()); args.push(format!("%\"{}\"%", f.kp)); }
    if !f.qtype.is_empty() { cond.push("qtype = ?".into()); args.push(f.qtype.clone()); }
    if !f.mastery.is_empty() { cond.push("mastery = ?".into()); args.push(f.mastery.clone()); }
    if f.only_wrong { cond.push("is_wrong = 1".into()); }
    if !f.keyword.is_empty() {
        cond.push("(text LIKE ? OR answer LIKE ? OR wrong_reason LIKE ? OR knowledge_points LIKE ?)".into());
        for _ in 0..4 { args.push(format!("%{}%", f.keyword)); }
    }
    let sql = format!(
        "SELECT {} FROM questions{} ORDER BY rowid",
        COLUMNS,
        if cond.is_empty() { String::new() } else { format!(" WHERE {}", cond.join(" AND ")) }
    );
    let c = conn()?;
    let mut stmt = c.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(args.iter()), row_to_q)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn insert(c: &Connection, q: &Map<String, Value>) -> Result<(), String> {
    c.execute(
        "INSERT OR REPLACE INTO questions (id, text, answer, grade, term, subject, \
         knowledge_points, is_wrong, wrong_reason, mastery, source_file, created_at, stage, qtype, \
         images, next_review_at, review_interval) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        params![
            q["id"].as_str().unwrap_or(""),
            q["text"].as_str().unwrap_or(""),
            q["answer"].as_str().unwrap_or(""),
            q["grade"].as_str().unwrap_or(""),
            q["term"].as_str().unwrap_or(""),
            q["subject"].as_str().unwrap_or(""),
            serde_json::to_string(&q["knowledgePoints"]).unwrap_or_else(|_| "[]".into()),
            if q["isWrong"].as_bool().unwrap_or(false) { 1 } else { 0 },
            q["wrongReason"].as_str().unwrap_or(""),
            q["mastery"].as_str().unwrap_or(""),
            q["sourceFile"].as_str().unwrap_or(""),
            q["createdAt"].as_str().unwrap_or(""),
            q["stage"].as_str().unwrap_or(""),
            q["qtype"].as_str().unwrap_or(""),
            serde_json::to_string(&q["images"]).unwrap_or_else(|_| "[]".into()),
            q["nextReviewAt"].as_str().unwrap_or(""),
            q["reviewInterval"].as_i64().unwrap_or(0),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 批量插入（跳过空题干），返回规范化后的入库题目。
pub fn insert_many(items: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
    let normalized: Vec<Map<String, Value>> = items
        .iter()
        .filter_map(|it| it.as_object())
        .map(normalize)
        .filter(|q| !q["text"].as_str().unwrap_or("").is_empty())
        .collect();
    if !normalized.is_empty() {
        let c = conn()?;
        for q in &normalized {
            insert(&c, q)?;
        }
    }
    Ok(normalized)
}

pub fn get_question(id: &str) -> Result<Option<Map<String, Value>>, String> {
    let c = conn()?;
    let q = c
        .query_row("SELECT * FROM questions WHERE id = ?", [id], row_to_q)
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(q)
}

pub fn update_question(id: &str, patch: &Map<String, Value>) -> Result<Option<Map<String, Value>>, String> {
    let existing = get_question(id)?;
    let existing = match existing {
        Some(e) => e,
        None => return Ok(None),
    };
    let mut merged = existing;
    for (k, v) in patch {
        merged.insert(k.clone(), v.clone());
    }
    merged.insert("id".into(), json!(id));
    let q = normalize(&merged);
    let c = conn()?;
    insert(&c, &q)?;
    Ok(Some(q))
}

pub fn delete_question(id: &str) -> Result<bool, String> {
    let c = conn()?;
    let n = c.execute("DELETE FROM questions WHERE id = ?", [id]).map_err(|e| e.to_string())?;
    Ok(n > 0)
}

/// 全量替换（导入 JSON / 加载示例数据用）。
pub fn replace_all(items: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
    let normalized: Vec<Map<String, Value>> = items
        .iter()
        .filter_map(|it| it.as_object())
        .map(normalize)
        .filter(|q| !q["text"].as_str().unwrap_or("").is_empty())
        .collect();
    let c = conn()?;
    c.execute("DELETE FROM questions", []).map_err(|e| e.to_string())?;
    for q in &normalized {
        insert(&c, q)?;
    }
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn norm(v: Value) -> Map<String, Value> {
        normalize(v.as_object().unwrap())
    }

    #[test]
    fn normalize_derives_stage_from_grade() {
        let q = norm(json!({"text": "t", "grade": "三年级"}));
        assert_eq!(q["stage"], "小学");
        let q = norm(json!({"text": "t", "grade": "高一"}));
        assert_eq!(q["stage"], "高中");
        let q = norm(json!({"text": "t", "grade": "七年级"}));
        assert_eq!(q["stage"], "初中");
        let q = norm(json!({"text": "t", "grade": ""}));
        assert_eq!(q["stage"], "其他");
    }

    #[test]
    fn normalize_keeps_explicit_stage() {
        let q = norm(json!({"text": "t", "stage": "大学", "grade": "高等数学"}));
        assert_eq!(q["stage"], "大学");
        assert_eq!(q["grade"], "高等数学");
        assert_eq!(q["term"], ""); // 大学无学期
        let q = norm(json!({"text": "t", "stage": "职业考试", "grade": "中级会计", "subject": "财务管理", "term": "上"}));
        assert_eq!(q["stage"], "职业考试");
        assert_eq!(q["subject"], "财务管理");
        assert_eq!(q["term"], ""); // 学期被清空
    }

    #[test]
    fn normalize_k12_keeps_term() {
        let q = norm(json!({"text": "t", "stage": "小学", "grade": "三年级", "term": "下"}));
        assert_eq!(q["term"], "下");
    }

    #[test]
    fn normalize_carries_qtype() {
        let q = norm(json!({"text": "t", "stage": "高中", "grade": "高一", "qtype": "选择"}));
        assert_eq!(q["qtype"], "选择");
        let q = norm(json!({"text": "t", "grade": "三年级"}));
        assert_eq!(q["qtype"], "");
    }

    #[test]
    fn normalize_free_input_classification() {
        let q = norm(json!({"text": "t", "stage": "大学", "grade": "机器学习导论", "subject": "第三章 神经网络"}));
        assert_eq!(q["grade"], "机器学习导论");
        assert_eq!(q["subject"], "第三章 神经网络");
    }

    #[test]
    fn stage_of_grade_mapping() {
        assert_eq!(stage_of_grade("六年级"), "小学");
        assert_eq!(stage_of_grade("九年级"), "初中");
        assert_eq!(stage_of_grade("高三"), "高中");
        assert_eq!(stage_of_grade("随便"), "其他");
    }

    #[test]
    fn qtype_vocab_by_stage() {
        assert!(qtype_vocab("小学").contains(&"口算"));
        assert!(qtype_vocab("职业考试").contains(&"申论"));
        assert!(qtype_vocab("大学").contains(&"计算证明"));
        assert!(qtype_vocab("高中").contains(&"实验探究"));
    }
}
