//! 嵌入式静态资源 + axum 服务启动。
//! demo/ 前端与 server/catalog.json 用 rust-embed 编译进二进制。

use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use rust_embed::RustEmbed;
use serde_json::Value;

#[derive(RustEmbed)]
#[folder = "../demo"]
struct Assets;

/// catalog.json 与 Python 版同一份文件，从 server/ 嵌入。
#[derive(RustEmbed)]
#[folder = "../server"]
struct ServerAssets;

pub fn load_catalog() -> Vec<Value> {
    ServerAssets::get("catalog.json")
        .and_then(|f| serde_json::from_slice::<Value>(&f.data).ok())
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
}

fn mime(path: &str) -> &'static str {
    if path.ends_with(".html") { "text/html; charset=utf-8" }
    else if path.ends_with(".css") { "text/css; charset=utf-8" }
    else if path.ends_with(".js") { "application/javascript; charset=utf-8" }
    else if path.ends_with(".json") { "application/json; charset=utf-8" }
    else if path.ends_with(".png") { "image/png" }
    else if path.ends_with(".svg") { "image/svg+xml" }
    else if path.ends_with(".ico") { "image/x-icon" }
    else { "application/octet-stream" }
}

/// 对齐 FastAPI StaticFiles 行为：GET / → index.html；路径命中嵌入文件则返回；否则 404。
pub async fn static_handler(uri: Uri) -> Response {
    let mut path = uri.path().trim_start_matches('/').to_string();
    if path.is_empty() {
        path = "index.html".to_string();
    }
    // 目录路径补 index.html
    if path.ends_with('/') {
        path.push_str("index.html");
    }
    // 防目录穿越
    if path.contains("..") {
        return StatusCode::NOT_FOUND.into_response();
    }
    match Assets::get(&path) {
        Some(file) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, mime(&path))],
            file.data.to_vec(),
        )
            .into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

/// 启动内嵌 HTTP 服务。port=0 表示动态端口，返回实际端口。
pub async fn start_on(port: u16) -> Result<u16, String> {
    let catalog = load_catalog();
    let app = crate::api::router(catalog);
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("HTTP 服务错误：{e}");
        }
    });
    Ok(port)
}

pub async fn start() -> Result<u16, String> {
    start_on(0).await
}
