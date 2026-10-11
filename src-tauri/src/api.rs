//! HTTP 服务：axum 路由 + 处理器，与 Python 版 18 个 REST 路由逐一对应。

use std::collections::BTreeMap;

use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde_json::{json, Map, Value};

use crate::prompts::{self, OutputError};
use crate::{ai, db, providers};

#[derive(Clone)]
pub struct AppState {
    /// catalog.json 解析后的条目数组
    pub catalog: Vec<Value>,
}

/// 统一错误结构：{"detail": {"type", "message"}}，对齐 FastAPI HTTPException。
pub struct ApiError {
    pub status: StatusCode,
    pub kind: String,
    pub message: String,
    /// 可选：覆盖 detail 内容（FastAPI 422 校验错误为数组结构）
    pub body: Option<Value>,
}

impl ApiError {
    pub fn new(status: StatusCode, kind: &str, message: String) -> Self {
        ApiError { status, kind: kind.into(), message, body: None }
    }
    pub fn bad_request(msg: &str) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "bad_request", msg.into())
    }
    pub fn not_found(msg: String) -> Self {
        Self::new(StatusCode::NOT_FOUND, "not_found", msg)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let detail = self.body.clone().unwrap_or_else(|| json!({"type": self.kind, "message": self.message}));
        (self.status, Json(json!({"detail": detail}))).into_response()
    }
}

fn db_err(e: String) -> ApiError {
    ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "db_error", e)
}

// ---------------- 题目 CRUD ----------------

#[derive(serde::Deserialize, Default)]
pub struct ListQuery {
    pub stage: Option<String>,
    pub grade: Option<String>,
    pub term: Option<String>,
    pub subject: Option<String>,
    pub kp: Option<String>,
    pub qtype: Option<String>,
    #[allow(non_snake_case)]
    pub onlyWrong: Option<String>,
    pub mastery: Option<String>,
    pub keyword: Option<String>,
}

/// 对齐 FastAPI bool Query：接受 1/true/True/yes 等真值。
fn parse_bool(s: &Option<String>) -> bool {
    match s.as_deref() {
        Some(v) => matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"),
        None => false,
    }
}

async fn list_questions(State(_st): State<AppState>, Query(q): Query<ListQuery>) -> Result<Json<Value>, ApiError> {
    let filters = db::Filters {
        stage: q.stage.unwrap_or_default(),
        grade: q.grade.unwrap_or_default(),
        term: q.term.unwrap_or_default(),
        subject: q.subject.unwrap_or_default(),
        kp: q.kp.unwrap_or_default(),
        qtype: q.qtype.unwrap_or_default(),
        mastery: q.mastery.unwrap_or_default(),
        only_wrong: parse_bool(&q.onlyWrong),
        keyword: q.keyword.unwrap_or_default(),
    };
    let rows = db::list_questions(&filters).map_err(db_err)?;
    Ok(Json(json!({"questions": rows, "total": rows.len()})))
}

/// body 可能是单个对象或数组；必须全部是对象，否则 400。
fn as_items(body: Value) -> Result<Vec<Value>, ApiError> {
    let items = match body {
        Value::Array(a) => a,
        Value::Object(_) => vec![body],
        _ => return Err(ApiError::bad_request("请求体必须是题目对象或对象数组")),
    };
    if !items.iter().all(|it| it.is_object()) {
        return Err(ApiError::bad_request("请求体必须是题目对象或对象数组"));
    }
    Ok(items)
}

async fn create_questions(State(_st): State<AppState>, body: Json<Value>) -> Result<Json<Value>, ApiError> {
    let items = as_items(body.0)?;
    let inserted = db::insert_many(&items).map_err(db_err)?;
    Ok(Json(json!({"inserted": inserted.len(), "questions": inserted})))
}

async fn update_question(State(_st): State<AppState>, Path(id): Path<String>, body: Json<Map<String, Value>>) -> Result<Json<Value>, ApiError> {
    match db::update_question(&id, &body.0).map_err(db_err)? {
        Some(q) => Ok(Json(Value::Object(q))),
        None => Err(ApiError::not_found(format!("题目不存在：{}", id))),
    }
}

async fn delete_question(State(_st): State<AppState>, Path(id): Path<String>) -> Result<Json<Value>, ApiError> {
    if !db::delete_question(&id).map_err(db_err)? {
        return Err(ApiError::not_found(format!("题目不存在：{}", id)));
    }
    Ok(Json(json!({"deleted": true})))
}

async fn export_all() -> Json<Value> {
    let rows = db::list_questions(&db::Filters::default()).unwrap_or_default();
    // 图片题干：导出时把图片文件读出为 base64 内嵌，跨机迁移自包含
    let mut images_data = serde_json::Map::new();
    for q in &rows {
        if let Some(arr) = q.get("images").and_then(|v| v.as_array()) {
            for name in arr.iter().filter_map(|v| v.as_str()) {
                if images_data.contains_key(name) {
                    continue;
                }
                let path = db::data_dir().join("images").join(name);
                if let Ok(bytes) = std::fs::read(&path) {
                    use base64::Engine;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    let mime = match name.rsplit('.').next().unwrap_or("") {
                        "png" => "image/png",
                        "webp" => "image/webp",
                        _ => "image/jpeg",
                    };
                    images_data.insert(name.to_string(), json!(format!("data:{mime};base64,{b64}")));
                }
            }
        }
    }
    Json(json!({
        "app": "cuotiji",
        "version": 3,
        "exportedAt": db::now_iso(),
        "questions": rows,
        "images_data": images_data,
    }))
}

async fn import_all(body: Json<Value>) -> Result<Json<Value>, ApiError> {
    // 图片数据落盘还原（存在 images_data 时）
    if let Some(map) = body.0.get("images_data").and_then(|v| v.as_object()) {
        let dir = db::data_dir().join("images");
        std::fs::create_dir_all(&dir).map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "io_error", e.to_string()))?;
        use base64::Engine;
        for (name, dataurl) in map {
            if !db::is_safe_image_name(name) {
                continue;
            }
            if let Some(b64) = dataurl.as_str().and_then(|s| s.split("base64,").nth(1)) {
                if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64) {
                    let _ = std::fs::write(dir.join(name), bytes);
                }
            }
        }
    }
    let arr: Option<Vec<Value>> = match &body.0 {
        Value::Array(a) => Some(a.clone()),
        Value::Object(m) => m.get("questions").and_then(|v| v.as_array()).cloned(),
        _ => None,
    };
    let arr = arr.ok_or_else(|| ApiError::bad_request("导入内容必须是题目数组或含 questions 字段的对象"))?;
    let inserted = db::replace_all(&arr).map_err(db_err)?;
    Ok(Json(json!({"imported": inserted.len()})))
}

// ---------------- SM-2 复习评分 ----------------

/// POST /api/review/{id} {"rating":"forgot"|"good"|"easy"} → 更新后的题目
async fn review_question(
    Path(id): Path<String>,
    body: Json<Map<String, Value>>,
) -> Result<Json<Value>, ApiError> {
    let rating = body.0.get("rating").and_then(|v| v.as_str()).unwrap_or("");
    if !matches!(rating, "forgot" | "good" | "easy") {
        return Err(ApiError::bad_request("rating 必须是 forgot / good / easy"));
    }
    match db::apply_review(&id, rating).map_err(db_err)? {
        Some(q) => Ok(Json(Value::Object(q))),
        None => Err(ApiError::not_found(format!("题目不存在：{id}"))),
    }
}

// ---------------- UI 偏好（服务端持久化：WebView origin 含动态端口，localStorage 无法跨次启动保留） ----------------

fn ui_prefs_path() -> std::path::PathBuf {
    db::data_dir().join("ui_prefs.json")
}

async fn get_ui_prefs() -> Json<Value> {
    let v = std::fs::read_to_string(ui_prefs_path())
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .unwrap_or_else(|| json!({}));
    Json(v)
}

async fn save_ui_prefs(body: Json<Map<String, Value>>) -> Result<Json<Value>, ApiError> {
    let path = ui_prefs_path();
    let mut cur: Map<String, Value> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();
    for (k, v) in body.0.iter() {
        cur.insert(k.clone(), v.clone());
    }
    std::fs::create_dir_all(db::data_dir()).map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "io_error", e.to_string()))?;
    std::fs::write(&path, serde_json::to_string_pretty(&cur).unwrap())
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "io_error", e.to_string()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(Json(Value::Object(cur)))
}

// ---------------- 图片题干 ----------------

/// 图片目录。
fn images_dir() -> std::path::PathBuf {
    db::data_dir().join("images")
}

/// POST /api/upload/image（multipart：file）→ {"name": "xxx.png"}
async fn upload_image(
    mut multipart: axum::extract::Multipart,
) -> Result<Json<Value>, ApiError> {
    let mut payload: Option<(Vec<u8>, String)> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::bad_request(&format!("上传解析失败：{e}")))?
    {
        if field.name() == Some("file") {
            let filename = field.file_name().unwrap_or("").to_lowercase();
            let ext = filename.rsplit('.').next().unwrap_or("").to_string();
            let data = field
                .bytes()
                .await
                .map_err(|e| ApiError::bad_request(&format!("读取文件失败：{e}")))?;
            payload = Some((data.to_vec(), ext));
            break;
        }
    }
    let (bytes, ext) = payload.ok_or_else(|| ApiError::bad_request("缺少 file 字段"))?;
    if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp") {
        return Err(ApiError::bad_request("仅支持 png / jpg / webp 图片"));
    }
    if bytes.len() > 10 * 1024 * 1024 {
        return Err(ApiError::bad_request("图片请控制在 10MB 以内"));
    }
    let name = format!("{}.{ext}", db::gen_id());
    let dir = images_dir();
    std::fs::create_dir_all(&dir).map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "io_error", e.to_string()))?;
    std::fs::write(dir.join(&name), &bytes).map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "io_error", e.to_string()))?;
    Ok(Json(json!({ "name": name })))
}

/// GET /images/{name} → 图片文件（白名单校验防目录穿越）。
async fn serve_image(Path(name): Path<String>) -> Result<Response, ApiError> {
    if !db::is_safe_image_name(&name) {
        return Err(ApiError::bad_request("非法图片名"));
    }
    let path = images_dir().join(&name);
    let bytes = std::fs::read(&path)
        .map_err(|_| ApiError::not_found(format!("图片不存在：{name}")))?;
    let mime = match name.rsplit('.').next().unwrap_or("") {
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };
    Ok(([(header::CONTENT_TYPE, mime)], bytes).into_response())
}

// ---------------- 配置 ----------------

async fn get_providers() -> Json<Value> {
    Json(providers::providers_payload())
}

async fn get_settings() -> Json<Value> {
    Json(providers::public_settings())
}

async fn save_settings(body: Json<Map<String, Value>>) -> Result<Json<Value>, ApiError> {
    let get = |k: &str| -> String {
        body.0.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string()
    };
    let provider = get("provider");
    if providers::preset(&provider).is_none() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "config_error",
            format!("未知厂商：{}", provider),
        ));
    }
    let old = providers::load_settings();
    let mut api_key = get("api_key").trim().to_string();
    // 前端回传打码值时保留原 Key
    if !api_key.is_empty() && Some(&api_key) == old.get("api_key").map(|k| providers::mask_key(k)).as_ref() {
        api_key = old.get("api_key").cloned().unwrap_or_default();
    }
    let mut st = BTreeMap::new();
    st.insert("provider".into(), provider);
    st.insert("base_url".into(), get("base_url").trim().to_string());
    st.insert("model".into(), get("model").trim().to_string());
    st.insert("api_key".into(), api_key);
    providers::save_settings(&st).map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "io_error", e.to_string()))?;
    Ok(Json(providers::public_settings()))
}

// ---------------- 知识点目录 ----------------

#[derive(serde::Deserialize, Default)]
pub struct CatalogQuery {
    pub stage: Option<String>,
    pub grade: Option<String>,
    pub term: Option<String>,
    pub subject: Option<String>,
}

/// 目录条目是否匹配查询（大学忽略学期/章节；其余按学段语义匹配）。
fn entry_matches(entry: &Value, stage: &str, grade: &str, term: &str, subject: &str) -> bool {
    if !stage.is_empty() && entry.get("stage").and_then(|v| v.as_str()) != Some(stage) { return false; }
    if !grade.is_empty() && entry.get("grade").and_then(|v| v.as_str()) != Some(grade) { return false; }
    match stage {
        "大学" => subject.is_empty() || entry.get("subject").and_then(|v| v.as_str()) == Some(subject),
        "职业考试" => subject.is_empty() || entry.get("subject").and_then(|v| v.as_str()) == Some(subject),
        _ => term.is_empty() || entry.get("term").and_then(|v| v.as_str()) == Some(term),
    }
}

async fn get_catalog(State(st): State<AppState>, Query(q): Query<CatalogQuery>) -> Json<Value> {
    let stage = q.stage.unwrap_or_default();
    let grade = q.grade.unwrap_or_default();
    let term = q.term.unwrap_or_default();
    let subject = q.subject.unwrap_or_default();
    let mut seen = std::collections::HashSet::new();
    let mut points = vec![];
    for entry in &st.catalog {
        if !entry_matches(entry, &stage, &grade, &term, &subject) { continue; }
        if let Some(arr) = entry.get("points").and_then(|v| v.as_array()) {
            for p in arr {
                if let Some(s) = p.as_str() {
                    if seen.insert(s.to_string()) {
                        points.push(json!(s));
                    }
                }
            }
        }
    }
    Json(json!({"knowledge_points": points}))
}

/// AI 打标的目录约束：K12 按 学段+年级+学期+科目；大学按 课程；职业考试按 项目+科目。
fn catalog_for(st: &AppState, payload: &Map<String, Value>) -> Vec<String> {
    let stage = payload.get("stage").and_then(|v| v.as_str()).unwrap_or("");
    let grade = payload.get("grade").and_then(|v| v.as_str()).unwrap_or("");
    let term = payload.get("term").and_then(|v| v.as_str()).unwrap_or("");
    let subject = payload.get("subject").and_then(|v| v.as_str()).unwrap_or("");
    let mut points = vec![];
    for entry in &st.catalog {
        if !entry_matches(entry, stage, grade, term, subject) { continue; }
        if let Some(arr) = entry.get("points").and_then(|v| v.as_array()) {
            points.extend(arr.iter().filter_map(|p| p.as_str().map(|s| s.to_string())));
        }
    }
    points
}

// ---------------- AI 任务 ----------------

/// 对齐 FastAPI pydantic 必填字段缺失时的 422 响应结构。
fn require_fields(payload: &Map<String, Value>, fields: &[&str]) -> Result<(), ApiError> {
    for f in fields {
        let missing = match payload.get(*f) {
            None => true,
            Some(Value::String(_s)) => false, // pydantic 只要求字段存在（空串也合法）
            Some(_) => false,
        };
        if missing {
            let detail = json!([{
                "type": "missing",
                "loc": ["body", f],
                "msg": "Field required",
                "input": Value::Object(payload.clone()),
            }]);
            return Err(ApiError {
                status: StatusCode::UNPROCESSABLE_ENTITY,
                kind: "validation".into(),
                message: format!("字段缺失：{f}"),
                body: Some(detail),
            });
        }
    }
    Ok(())
}

/// 对齐 Python run_task。
async fn run_task(st: &AppState, task: &str, payload: Map<String, Value>) -> Result<Value, ApiError> {
    match task {
        "tag" | "solve" | "similar" => require_fields(&payload, &["question"])?,
        "split-check" => require_fields(&payload, &["items"])?,
        _ => {}
    }
    let conf = providers::resolved();
    if conf.provider == "mock" {
        return prompts::mock_response(task, &payload)
            .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "mock_error", e.0));
    }
    if conf.api_key.is_empty() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "config_error",
            "尚未配置 API Key，请在「AI 设置」中配置，或选择 Mock 厂商".into(),
        ));
    }
    let catalog = if task == "tag" { catalog_for(st, &payload) } else { vec![] };
    let messages = prompts::build_messages(task, &payload, &catalog)
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "prompt_error", e.0))?;
    let content = ai::chat(&conf.base_url, &conf.api_key, &conf.model, messages, 2000)
        .await
        .map_err(|e| ApiError::new(StatusCode::BAD_GATEWAY, e.kind, e.message))?;
    prompts::parse_task(task, &content)
        .map_err(|e: OutputError| ApiError::new(StatusCode::BAD_GATEWAY, "output_error", e.0))
}

async fn ai_test() -> Result<Json<Value>, ApiError> {
    let conf = providers::resolved();
    if conf.provider == "mock" {
        return Ok(Json(json!({"ok": true, "reply": "Mock 厂商：离线模式，无需 Key，全流程可联调。"})));
    }
    if conf.api_key.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "config_error", "尚未配置 API Key".into()));
    }
    let content = ai::chat(
        &conf.base_url, &conf.api_key, &conf.model,
        vec![json!({"role": "user", "content": "ping，请只回复 pong"})], 10,
    )
    .await
    .map_err(|e| ApiError::new(StatusCode::BAD_GATEWAY, e.kind, e.message))?;
    let reply: String = content.trim().chars().take(100).collect();
    Ok(Json(json!({"ok": true, "reply": reply})))
}

async fn ai_tag(State(st): State<AppState>, body: Json<Map<String, Value>>) -> Result<Json<Value>, ApiError> {
    let payload = body.0;
    let mut result = run_task(&st, "tag", payload.clone()).await?;
    if let Some(obj) = result.as_object_mut() {
        obj.insert("catalog".into(), json!(catalog_for(&st, &payload)));
    }
    Ok(Json(result))
}

async fn ai_solve(State(st): State<AppState>, body: Json<Map<String, Value>>) -> Result<Json<Value>, ApiError> {
    Ok(Json(run_task(&st, "solve", body.0).await?))
}

async fn ai_similar(State(st): State<AppState>, body: Json<Map<String, Value>>) -> Result<Json<Value>, ApiError> {
    let mut payload = body.0;
    let count = payload.get("count").and_then(|v| v.as_i64()).unwrap_or(3).clamp(1, 10);
    payload.insert("count".into(), json!(count));
    Ok(Json(run_task(&st, "similar", payload).await?))
}

async fn ai_split_check(State(st): State<AppState>, body: Json<Map<String, Value>>) -> Result<Json<Value>, ApiError> {
    Ok(Json(run_task(&st, "split-check", body.0).await?))
}

// ---------------- 文档解析（docx） ----------------

/// POST /api/parse/docx（multipart：file 字段）→ {"text": "..."}
async fn parse_docx(
    mut multipart: axum::extract::Multipart,
) -> Result<Json<Value>, ApiError> {
    let mut bytes: Option<Vec<u8>> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::bad_request(&format!("上传解析失败：{e}")))?
    {
        if field.name() == Some("file") {
            let data = field
                .bytes()
                .await
                .map_err(|e| ApiError::bad_request(&format!("读取文件失败：{e}")))?;
            bytes = Some(data.to_vec());
            break;
        }
    }
    let bytes = bytes.ok_or_else(|| ApiError::bad_request("缺少 file 字段"))?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err(ApiError::bad_request("文件超过 20MB 限制"));
    }
    // docx 魔数：PK\x03\x04
    if !bytes.starts_with(b"PK\x03\x04") {
        return Err(ApiError::bad_request("仅支持 .docx（Word 2007+）；.doc 老格式请先另存为 .docx"));
    }
    let text = crate::parse_docx::extract_text(&bytes)
        .map_err(|e| ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "parse_error", e))?;
    Ok(Json(json!({ "text": text })))
}

// ---------------- AI：图片文字识别 ----------------

/// POST /api/ai/ocr（JSON：image 为 dataURL）→ {"text": "..."}
async fn ai_ocr(body: Json<Map<String, Value>>) -> Result<Json<Value>, ApiError> {
    let image = body
        .0
        .get("image")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if !image.starts_with("data:image/") || !image.contains(";base64,") {
        return Err(ApiError::bad_request("image 必须是 data:image/...;base64,... 格式"));
    }
    let conf = providers::resolved();
    if conf.provider == "mock" {
        return Ok(Json(json!({ "text": crate::prompts::MOCK_OCR_TEXT })));
    }
    if conf.api_key.is_empty() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "config_error",
            "尚未配置 API Key，请在「AI 设置」中配置，或选择 Mock 厂商".into(),
        ));
    }
    let prompt = crate::prompts::OCR_PROMPT;
    let content = ai::vision_chat(&conf.base_url, &conf.api_key, &conf.model, prompt, &image, 4000)
        .await
        .map_err(|e| ApiError::new(StatusCode::BAD_GATEWAY, e.kind, e.message))?;
    Ok(Json(json!({ "text": content })))
}

// ---------------- 健康检查 ----------------

async fn healthz() -> Json<Value> {
    Json(json!({"ok": true}))
}

// ---------------- 路由表 ----------------

pub fn router(catalog: Vec<Value>) -> Router {
    let state = AppState { catalog };
    Router::new()
        .route("/healthz", get(healthz))
        .route("/api/questions", get(list_questions).post(create_questions))
        .route("/api/questions/{id}", put(update_question).delete(delete_question))
        .route("/api/export", get(export_all))
        .route("/api/import", post(import_all))
        .route("/api/providers", get(get_providers))
        .route("/api/settings", get(get_settings).post(save_settings))
        .route("/api/catalog", get(get_catalog))
        .route("/api/ai/test", post(ai_test))
        .route("/api/ai/tag", post(ai_tag))
        .route("/api/ai/solve", post(ai_solve))
        .route("/api/ai/similar", post(ai_similar))
        .route("/api/ai/split-check", post(ai_split_check))
        .route("/api/parse/docx", post(parse_docx))
        .route("/api/ai/ocr", post(ai_ocr))
        .route("/api/upload/image", post(upload_image))
        .route("/images/{name}", get(serve_image))
        .route("/api/review/{id}", post(review_question))
        .route("/api/ui_prefs", get(get_ui_prefs).post(save_ui_prefs))
        .fallback(crate::server::static_handler)
        .with_state(state)
}
