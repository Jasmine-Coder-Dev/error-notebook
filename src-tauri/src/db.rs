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
    created_at      TEXT NOT NULL DEFAULT ''
);
";

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
    Ok(c)
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

/// 对齐 Python db.normalize：字段规范化。
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

    let pick = |key: &str, valid: &[&str], default: &str| -> Value {
        match get_s(key) {
            Some(v) if valid.contains(&v.as_str()) => json!(v),
            Some(v) => json!(v), // Python 行为：未知但非空的值原样保留
            None => json!(default),
        }
    };
    // 注意：Python 对 grade/term/subject 是「在列表中保留，否则原样（空则默认）」；
    // 对 mastery 是「不在列表中一律默认 未掌握」。
    let grade = pick("grade", GRADES, GRADES[0]);
    let term = pick("term", TERMS, TERMS[0]);
    let subject = pick("subject", SUBJECTS, SUBJECTS[1]);
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

    let mut m = Map::new();
    m.insert("id".into(), json!(id));
    m.insert("text".into(), json!(get_s("text").unwrap_or_default()));
    m.insert("answer".into(), json!(get_s("answer").unwrap_or_default()));
    m.insert("grade".into(), grade);
    m.insert("term".into(), term);
    m.insert("subject".into(), subject);
    m.insert("knowledgePoints".into(), json!(kps));
    m.insert("isWrong".into(), json!(is_wrong));
    m.insert("wrongReason".into(), json!(get_s("wrongReason").or_else(|| get_s("wrong_reason")).unwrap_or_default()));
    m.insert("mastery".into(), mastery);
    m.insert("sourceFile".into(), json!(get_s("sourceFile").or_else(|| get_s("source_file")).unwrap_or_default()));
    m.insert("createdAt".into(), json!(created));
    m
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

/// 对齐 Python db.row_to_q：行 → camelCase JSON。
pub fn row_to_q(row: &rusqlite::Row) -> rusqlite::Result<Map<String, Value>> {
    let kps: Vec<Value> = serde_json::from_str(&row.get::<_, String>(6)?)
        .unwrap_or_else(|_| vec![]);
    let mut m = Map::new();
    m.insert("id".into(), json!(row.get::<_, String>(0)?));
    m.insert("text".into(), json!(row.get::<_, String>(1)?));
    m.insert("answer".into(), json!(row.get::<_, String>(2)?));
    m.insert("grade".into(), json!(row.get::<_, String>(3)?));
    m.insert("term".into(), json!(row.get::<_, String>(4)?));
    m.insert("subject".into(), json!(row.get::<_, String>(5)?));
    m.insert("knowledgePoints".into(), json!(kps));
    m.insert("isWrong".into(), json!(row.get::<_, i32>(7)? != 0));
    m.insert("wrongReason".into(), json!(row.get::<_, String>(8)?));
    m.insert("mastery".into(), json!(row.get::<_, String>(9)?));
    m.insert("sourceFile".into(), json!(row.get::<_, String>(10)?));
    m.insert("createdAt".into(), json!(row.get::<_, String>(11)?));
    Ok(m)
}

#[derive(Default)]
pub struct Filters {
    pub grade: String,
    pub term: String,
    pub subject: String,
    pub kp: String,
    pub mastery: String,
    pub only_wrong: bool,
    pub keyword: String,
}

/// 对齐 Python db.list_questions：服务端组合筛选，ORDER BY rowid。
pub fn list_questions(f: &Filters) -> Result<Vec<Map<String, Value>>, String> {
    let mut cond: Vec<String> = vec![];
    let mut args: Vec<String> = vec![];
    if !f.grade.is_empty() { cond.push("grade = ?".into()); args.push(f.grade.clone()); }
    if !f.term.is_empty() { cond.push("term = ?".into()); args.push(f.term.clone()); }
    if !f.subject.is_empty() { cond.push("subject = ?".into()); args.push(f.subject.clone()); }
    if !f.kp.is_empty() { cond.push("knowledge_points LIKE ?".into()); args.push(format!("%\"{}\"%", f.kp)); }
    if !f.mastery.is_empty() { cond.push("mastery = ?".into()); args.push(f.mastery.clone()); }
    if f.only_wrong { cond.push("is_wrong = 1".into()); }
    if !f.keyword.is_empty() {
        cond.push("(text LIKE ? OR answer LIKE ? OR wrong_reason LIKE ? OR knowledge_points LIKE ?)".into());
        for _ in 0..4 { args.push(format!("%{}%", f.keyword)); }
    }
    let sql = format!(
        "SELECT * FROM questions{} ORDER BY rowid",
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
         knowledge_points, is_wrong, wrong_reason, mastery, source_file, created_at) \
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
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
