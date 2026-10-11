//! 四类 AI 任务的 Prompt 模板 + JSON 提取兜底 + 字段校验 + Mock 数据。
//! 从 server/prompts.py 全量移植：同输入下 prompt 文本与 mock 输出逐字一致。

use regex::Regex;
use serde_json::{json, Map, Value};

#[derive(Debug)]
pub struct OutputError(pub String);

impl std::fmt::Display for OutputError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

pub const SYSTEM_JSON: &str = "你是一名严谨的中小学教研助手。所有回答必须且只能是 JSON，不要输出任何 JSON 以外的文字、解释或 Markdown 代码块标记。";

/// 图片文字识别（OCR）任务的 prompt 与 Mock 样例文本（v0.0.3 新增，无 Python 版对应）。
pub const OCR_PROMPT: &str = "你是精确的文字识别引擎。请把图片中的题目文字逐字提取为纯文本输出：
1. 保持原有题号（如 1. / 2、/ (1)）与换行结构
2. 数学公式用文本近似表示（如 3/4 × 8/9、x²）
3. 不要添加任何解释、总结或 Markdown 标记，只输出图片中的文字内容
4. 手写内容尽量辨认；无法辨认的字符用 ▢ 占位";

pub const MOCK_OCR_TEXT: &str = "1. 计算下列各题：(1) 3/4 × 8/9 = （2） 12.5 - 7.8 =
2. 一辆汽车每小时行驶 60 千米，行驶 2.5 小时共行驶多少千米？
3. 已知长方形的长是 8 厘米，宽是 5 厘米，求它的周长和面积。";

// 与 server/prompts.py 模板逐字一致（Python {{ }} 转义已展开为字面 { }）
// K12 学段沿用此模板（与 Python 版逐字对拍保持一致）；
// 大学/职业考试使用 PROMPT_TAG_UNI / PROMPT_TAG_VOC（一期新增）。
const PROMPT_TAG: &str = "请为下面这道{grade}{term}学期{subject}题标注知识点。

要求：
1. 优先从给定知识点目录中挑选最贴切的，最多 5 个；
2. 目录确实没有合适的，可以补充自定义知识点，必须将 custom 置为 true；
3. 目录内的知识点 custom 置为 false；
4. 只输出 JSON，格式：{\"knowledge_points\": [{\"name\": \"知识点名\", \"custom\": false}]}

知识点目录（可选）：
{catalog}

题目：
{question}
";

/// 大学学段：课程×章节，标签粒度=章节知识点；同时判断题型。
const PROMPT_TAG_UNI: &str = "请为下面这道大学《{grade}》门类《{subject}》课程的题目标注知识点。

要求：
1. 优先从给定课程知识点目录中挑选最贴切的，最多 5 个，标签粒度为课程知识点；
2. 目录确实没有合适的，可以补充自定义知识点，必须将 custom 置为 true；
3. 目录内的知识点 custom 置为 false；
4. 同时判断该题题型，从「{qtype_vocab}」中选择最合适的一个；
5. 只输出 JSON，格式：{\"knowledge_points\": [{\"name\": \"知识点名\", \"custom\": false}], \"qtype\": \"题型\"}

知识点目录（可选）：
{catalog}

题目：
{question}
";

/// 职业考试学段：考试项目×科目，标签粒度=考点；同时判断题型。
const PROMPT_TAG_VOC: &str = "请为下面这道{grade}考试《{subject}》科目的题目标注知识点。

要求：
1. 优先从给定「考试项目×科目」考点目录中挑选最贴切的，最多 5 个，标签粒度为考点；
2. 目录确实没有合适的，可以补充自定义知识点，必须将 custom 置为 true；
3. 目录内的知识点 custom 置为 false；
4. 同时判断该题题型，从「{qtype_vocab}」中选择最合适的一个；
5. 只输出 JSON，格式：{\"knowledge_points\": [{\"name\": \"知识点名\", \"custom\": false}], \"qtype\": \"题型\"}

知识点目录（可选）：
{catalog}

题目：
{question}
";

const PROMPT_SOLVE: &str = "请解答下面这道{grade}{term}学期{subject}题。

要求：
1. 答案要准确、简洁，适合中小学生理解；
2. 解析给出关键步骤和涉及的知识点；
3. 只输出 JSON，格式：{\"answer\": \"最终答案\", \"explanation\": \"解析过程\"}

题目：
{question}
";

const PROMPT_SIMILAR: &str = "请根据下面的原题和知识点，生成 {count} 道同类型、同难度的练习题（变式，不要照抄原题）。

要求：
1. 每道题都附准确答案（必要时附简要解析）；
2. 题目表述完整、可独立作答；
3. 只输出 JSON，格式：{\"questions\": [{\"text\": \"题目\", \"answer\": \"答案\"}]}

原题：
{question}

知识点：{knowledge_points}
{grade}{term}{subject}

请生成 {count} 道同类题。
";

const PROMPT_SPLIT_CHECK: &str = "下面是一份按题号从试卷中切分出的题目列表（JSON）。

请校对切分结果：
1. 被误切的题（一道题被拆成多条、或残留题号碎片）请合并为完整一道题；
2. 多条题目被粘连在一起的请拆开；
3. 明显不是题目内容的页眉、页脚、注意事项请剔除；
4. 为每题标注题型（选择题/填空题/判断题/计算题/应用题/解答题/默写题/写作题/阅读题/其他）；
5. 保持题目原有文字，只修正切分与题型，不要改写题目内容；
6. 只输出 JSON，格式：{\"items\": [{\"text\": \"完整题目\", \"type\": \"题型\"}]}

待校对题目：
{items}
";

fn s<'a>(payload: &'a Map<String, Value>, key: &str) -> &'a str {
    payload.get(key).and_then(|v| v.as_str()).unwrap_or("")
}

/// 对齐 Python prompts.build_messages：返回 [system, user] 两条消息。
pub fn build_messages(task: &str, payload: &Map<String, Value>, catalog: &[String]) -> Result<Vec<Value>, OutputError> {
    let grade = s(payload, "grade");
    let term = s(payload, "term");
    let subject = s(payload, "subject");
    let user = match task {
        "tag" => {
            let catalog_str = if catalog.is_empty() {
                "（无目录，可自行补充并标记 custom）".to_string()
            } else {
                catalog.iter().map(|c| format!("- {}", c)).collect::<Vec<_>>().join("\n")
            };
            let stage = s(payload, "stage");
            if stage == "大学" {
                PROMPT_TAG_UNI
                    .replace("{grade}", grade)
                    .replace("{qtype_vocab}", &crate::db::qtype_vocab("大学").join("、"))
                    .replace("{catalog}", &catalog_str)
                    .replace("{question}", s(payload, "question"))
            } else if stage == "职业考试" {
                PROMPT_TAG_VOC
                    .replace("{grade}", grade)
                    .replace("{subject}", subject)
                    .replace("{qtype_vocab}", &crate::db::qtype_vocab("职业考试").join("、"))
                    .replace("{catalog}", &catalog_str)
                    .replace("{question}", s(payload, "question"))
            } else {
                PROMPT_TAG
                    .replace("{grade}", grade)
                    .replace("{term}", term)
                    .replace("{subject}", subject)
                    .replace("{catalog}", &catalog_str)
                    .replace("{question}", s(payload, "question"))
            }
        }
        "solve" => PROMPT_SOLVE
            .replace("{grade}", grade)
            .replace("{term}", term)
            .replace("{subject}", subject)
            .replace("{question}", s(payload, "question")),
        "similar" => {
            let kps = payload
                .get("knowledge_points")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str())
                        .collect::<Vec<_>>()
                        .join("、")
                })
                .unwrap_or_default();
            PROMPT_SIMILAR
                .replace("{count}", &payload.get("count").and_then(|v| v.as_i64()).unwrap_or(3).to_string())
                .replace("{question}", s(payload, "question"))
                .replace("{knowledge_points}", if kps.is_empty() { "未指定" } else { &kps })
                .replace("{grade}", grade)
                .replace("{term}", term)
                .replace("{subject}", subject)
        }
        "split-check" => {
            let items: Vec<Value> = payload
                .get("items")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .enumerate()
                        .map(|(i, it)| json!({"index": i + 1, "text": it.get("text").and_then(|t| t.as_str()).unwrap_or("")}))
                        .collect()
                })
                .unwrap_or_default();
            PROMPT_SPLIT_CHECK.replace(
                "{items}",
                &serde_json::to_string_pretty(&json!(items)).unwrap_or_default(),
            )
        }
        _ => return Err(OutputError(format!("未知任务类型: {}", task))),
    };
    Ok(vec![
        json!({"role": "system", "content": SYSTEM_JSON}),
        json!({"role": "user", "content": user}),
    ])
}

// ---------------- JSON 提取：解析失败时正则兜底 ----------------

fn extract_json(text: &str) -> Result<Value, OutputError> {
    let t = text.trim();
    if t.is_empty() {
        return Err(OutputError("模型返回为空".into()));
    }
    // 1) 直接解析（或剥掉 ```json 围栏）
    let re = Regex::new(r"```(?:json)?\s*(.*?)```").unwrap();
    let candidate = re.captures(t).map(|c| c.get(1).unwrap().as_str().trim().to_string()).unwrap_or_else(|| t.to_string());
    if let Ok(v) = serde_json::from_str::<Value>(&candidate) {
        return Ok(v);
    }
    // 2) 兜底：截取第一个 { 到配对的 }（支持字符串内转义）
    let bytes = t.as_bytes();
    let start = t.find('{').ok_or_else(|| OutputError("模型输出中未找到 JSON 对象".into()))?;
    let mut depth = 0i32;
    let mut in_str = false;
    let mut escape = false;
    for (i, &b) in bytes.iter().enumerate().skip(start) {
        if escape {
            escape = false;
            continue;
        }
        if b == b'\\' {
            escape = true;
            continue;
        }
        if b == b'"' {
            in_str = !in_str;
            continue;
        }
        if in_str {
            continue;
        }
        if b == b'{' {
            depth += 1;
        } else if b == b'}' {
            depth -= 1;
            if depth == 0 {
                return serde_json::from_str(&t[start..=i])
                    .map_err(|e| OutputError(format!("JSON 解析失败：{}", e)));
            }
        }
    }
    Err(OutputError("模型输出的 JSON 大括号不配对".into()))
}

// ---------------- 字段校验 ----------------

pub fn parse_tag(content: &str) -> Result<Value, OutputError> {
    let data = extract_json(content)?;
    let kps = data
        .get("knowledge_points")
        .and_then(|v| v.as_array())
        .filter(|a| !a.is_empty())
        .ok_or_else(|| OutputError("knowledge_points 缺失或为空".into()))?;
    let mut out = vec![];
    for item in kps.iter().take(8) {
        if let Some(name) = item.as_str() {
            let name = name.trim();
            if !name.is_empty() {
                out.push(json!({"name": name, "custom": true}));
            }
        } else if let Some(obj) = item.as_object() {
            let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            if !name.is_empty() {
                out.push(json!({"name": name, "custom": obj.get("custom").and_then(|v| v.as_bool()).unwrap_or(false)}));
            }
        }
    }
    if out.is_empty() {
        return Err(OutputError("knowledge_points 中没有合法条目".into()));
    }
    // qtype（题型）可选：AI 未返回时留空，前端显示「未分类」
    let qtype = data
        .get("qtype")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let mut result = json!({"knowledge_points": out});
    if !qtype.is_empty() {
        result["qtype"] = json!(qtype);
    }
    Ok(result)
}

pub fn parse_solve(content: &str) -> Result<Value, OutputError> {
    let data = extract_json(content)?;
    let answer = data.get("answer").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let explanation = data.get("explanation").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    if answer.is_empty() && explanation.is_empty() {
        return Err(OutputError("answer / explanation 均为空".into()));
    }
    Ok(json!({"answer": answer, "explanation": explanation}))
}

pub fn parse_similar(content: &str) -> Result<Value, OutputError> {
    let data = extract_json(content)?;
    let qs = data
        .get("questions")
        .and_then(|v| v.as_array())
        .filter(|a| !a.is_empty())
        .ok_or_else(|| OutputError("questions 缺失或为空".into()))?;
    let mut out = vec![];
    for q in qs {
        if let Some(obj) = q.as_object() {
            let text = obj.get("text").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            if !text.is_empty() {
                out.push(json!({
                    "text": text,
                    "answer": obj.get("answer").and_then(|v| v.as_str()).unwrap_or("").trim(),
                }));
            }
        }
    }
    if out.is_empty() {
        return Err(OutputError("questions 中没有合法条目".into()));
    }
    Ok(json!({"questions": out}))
}

pub fn parse_split_check(content: &str) -> Result<Value, OutputError> {
    let data = extract_json(content)?;
    let items = data
        .get("items")
        .and_then(|v| v.as_array())
        .filter(|a| !a.is_empty())
        .ok_or_else(|| OutputError("items 缺失或为空".into()))?;
    let mut out = vec![];
    for it in items {
        if let Some(obj) = it.as_object() {
            let text = obj.get("text").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            if !text.is_empty() {
                let ty = obj.get("type").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                out.push(json!({"text": text, "type": if ty.is_empty() { "其他" } else { ty.as_str() }}));
            }
        }
    }
    if out.is_empty() {
        return Err(OutputError("items 中没有合法条目".into()));
    }
    Ok(json!({"items": out}))
}

pub fn parse_task(task: &str, content: &str) -> Result<Value, OutputError> {
    match task {
        "tag" => parse_tag(content),
        "solve" => parse_solve(content),
        "similar" => parse_similar(content),
        "split-check" => parse_split_check(content),
        _ => Err(OutputError(format!("未知任务类型: {}", task))),
    }
}

// ---------------- Mock 数据（与 Python 版逐字一致） ----------------

const TYPE_RULES: &[(&str, &[&str])] = &[
    ("选择题", &["A.", "B.", "C.", "D.", "（ ）", "( )", "选择"]),
    ("判断题", &["判断", "对的打", "正确吗", "是否正确"]),
    ("填空题", &["填空", "______", "＿＿", "（　）", "横线上"]),
    ("计算题", &["计算", "直接写出得数", "竖式", "脱式", "口算"]),
    ("应用题", &["应用题", "多少千米", "多少元", "多少千克", "一共", "还剩"]),
    ("默写题", &["默写", "补充诗句", "根据课文"]),
    ("写作题", &["作文", "写一段话", "习作", "写一写"]),
    ("阅读题", &["阅读短文", "阅读理解", "读下面的"]),
    ("解答题", &["解方程", "证明", "求解", "解答"]),
];

fn guess_type(text: &str) -> &'static str {
    for (t, keys) in TYPE_RULES {
        if keys.iter().any(|k| text.contains(k)) {
            return t;
        }
    }
    "其他"
}

pub fn mock_response(task: &str, payload: &Map<String, Value>) -> Result<Value, OutputError> {
    match task {
        "tag" => {
            let subject = s(payload, "subject");
            let base: [&str; 2] = match subject {
                "语文" => ["字词积累", "阅读理解"],
                "数学" => ["基础运算", "应用题"],
                "英语" => ["词汇运用", "语法"],
                _ => ["基础知识", "综合运用"],
            };
            let label = if subject.is_empty() { "综合" } else { subject };
            // Mock 题型：沿用切分猜测规则后映射到新词表
            let raw = guess_type(s(payload, "question"));
            let qtype = match raw {
                "选择题" => "选择",
                "填空题" => "填空",
                "判断题" => "判断",
                "计算题" => "计算",
                "解答题" => "计算证明",
                "阅读题" => "阅读理解",
                "写作题" => "作文",
                "默写题" => "默写",
                other => other,
            };
            Ok(json!({"knowledge_points": [
                {"name": base[0], "custom": false},
                {"name": base[1], "custom": false},
                {"name": format!("Mock 补充知识点（{}）", label), "custom": true},
            ], "qtype": qtype}))
        }
        "solve" => Ok(json!({
            "answer": "（Mock 答案）42",
            "explanation": "【Mock 解析】这是离线模拟数据：理解题意 → 找出数量关系 → 列式计算 → 检验作答。配置真实厂商 Key 后将返回真实解答。",
        })),
        "similar" => {
            let n = payload.get("count").and_then(|v| v.as_i64()).unwrap_or(3).clamp(1, 10);
            let kp = payload
                .get("knowledge_points")
                .and_then(|v| v.as_array())
                .filter(|a| !a.is_empty())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str())
                        .collect::<Vec<_>>()
                        .join("、")
                })
                .unwrap_or_else(|| "综合".to_string());
            let question = s(payload, "question");
            let src: String = question.chars().take(30).collect();
            let src = if src.is_empty() { "原题".to_string() } else { src };
            let qs: Vec<Value> = (0..n)
                .map(|i| {
                    json!({
                        "text": format!("【Mock 同类题 {}】围绕知识点「{}」、与原题（{}…）同考点的变式练习。", i + 1, kp, src),
                        "answer": format!("【Mock 答案 {}】略。", i + 1),
                    })
                })
                .collect();
            Ok(json!({"questions": qs}))
        }
        "split-check" => {
            let items: Vec<Value> = payload
                .get("items")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|it| it.get("text").and_then(|t| t.as_str()))
                        .filter(|t| !t.trim().is_empty())
                        .map(|t| {
                            let t = t.trim();
                            json!({"text": t, "type": guess_type(t)})
                        })
                        .collect()
                })
                .unwrap_or_default();
            Ok(json!({"items": items}))
        }
        _ => Err(OutputError(format!("未知任务类型: {}", task))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Map;

    fn payload(obj: Value) -> Map<String, Value> {
        obj.as_object().unwrap().clone()
    }

    fn assert_same(task: &str, got: Vec<Value>, expect_file: &str) {
        let expect: Vec<Value> = serde_json::from_str(expect_file).unwrap();
        assert_eq!(got.len(), expect.len(), "{} 消息条数不同", task);
        for (i, (g, e)) in got.iter().zip(expect.iter()).enumerate() {
            assert_eq!(g["role"].as_str().unwrap(), e["role"].as_str().unwrap(), "{} 第{}条 role 不同", task, i);
            let gc = g["content"].as_str().unwrap();
            let ec = e["content"].as_str().unwrap();
            if gc != ec {
                eprintln!("=== {} 第{}条 content diff ===\n--- Python ---\n{}\n--- Rust ---\n{}", task, i, ec, gc);
                panic!("{} 第{}条 content 不一致", task, i);
            }
        }
    }

    #[test]
    fn prompt_tag_matches_python() {
        let p = payload(json!({"question": "计算 3/4 × 8/9 = ？", "grade": "五年级", "term": "上", "subject": "数学"}));
        let got = build_messages("tag", &p, &["分数乘法".into(), "约分".into(), "小数乘法".into()]).unwrap();
        assert_same("tag", got, include_str!("../../tests-expect/expect_tag.json"));
    }

    #[test]
    fn prompt_solve_matches_python() {
        let p = payload(json!({"question": "解方程 2x-7=15", "grade": "七年级", "term": "上", "subject": "数学"}));
        let got = build_messages("solve", &p, &[]).unwrap();
        assert_same("solve", got, include_str!("../../tests-expect/expect_solve.json"));
    }

    #[test]
    fn prompt_similar_matches_python() {
        let p = payload(json!({"question": "计算 3/4×8/9", "knowledge_points": ["分数乘法", "约分"], "count": 3, "grade": "五年级", "term": "上", "subject": "数学"}));
        let got = build_messages("similar", &p, &[]).unwrap();
        assert_same("similar", got, include_str!("../../tests-expect/expect_similar.json"));
    }

    #[test]
    fn prompt_split_check_matches_python() {
        let p = payload(json!({"items": [{"text": "计算 2+3=？"}, {"text": "下列说法正确的是（ ）A.甲 B.乙"}], "grade": "", "term": "", "subject": ""}));
        let got = build_messages("split-check", &p, &[]).unwrap();
        assert_same("split-check", got, include_str!("../../tests-expect/expect_split.json"));
    }

    #[test]
    fn mock_tag_matches_python() {
        let p = payload(json!({"question": "q", "grade": "五年级", "term": "上", "subject": "语文"}));
        let got = mock_response("tag", &p).unwrap();
        let expect: Value = serde_json::from_str(include_str!("../../tests-expect/expect_mock_tag.json")).unwrap();
        assert_eq!(got, expect);
    }
}
