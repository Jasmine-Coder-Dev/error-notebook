//! OpenAI 兼容客户端（reqwest + rustls）。
//! 错误分类对齐 Python server/ai.py：auth_error / network_error / api_error / output_error。

use serde_json::{json, Value};

pub struct AiError {
    pub kind: &'static str,
    pub message: String,
}

impl AiError {
    fn new(kind: &'static str, message: String) -> Self {
        AiError { kind, message }
    }
}

/// 对齐 Python ai.chat：chat.completions，temperature=0.2。
pub async fn chat(base_url: &str, api_key: &str, model: &str, messages: Vec<Value>,
                  max_tokens: u32) -> Result<String, AiError> {
    if base_url.is_empty() {
        return Err(AiError::new("config_error", "未配置 base_url".into()));
    }
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let content = chat_raw(base_url, api_key, model, messages, max_tokens, &url).await?;
    Ok(content)
}

/// 视觉识别（OpenAI 兼容 image_url 格式）：messages 的 user content 为
/// [{type:"text"},{type:"image_url",image_url:{url:"data:image/...;base64,..."}}]。
pub async fn vision_chat(base_url: &str, api_key: &str, model: &str,
                         prompt: &str, image_data_url: &str,
                         max_tokens: u32) -> Result<String, AiError> {
    if base_url.is_empty() {
        return Err(AiError::new("config_error", "未配置 base_url".into()));
    }
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let messages = vec![json!({
        "role": "user",
        "content": [
            { "type": "text", "text": prompt },
            { "type": "image_url", "image_url": { "url": image_data_url } }
        ]
    })];
    chat_raw(base_url, api_key, model, messages, max_tokens, &url).await
}

async fn chat_raw(_base_url: &str, api_key: &str, model: &str, messages: Vec<Value>,
                  max_tokens: u32, url: &str) -> Result<String, AiError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| AiError::new("network_error", format!("连接厂商接口失败：{}", e)))?;

    let resp = client
        .post(url)
        .bearer_auth(api_key)
        .json(&json!({
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": max_tokens,
        }))
        .send()
        .await
        .map_err(|e| AiError::new("network_error", format!("连接厂商接口失败：{}", e)))?;

    let status = resp.status().as_u16();
    if status == 401 || status == 403 {
        return Err(AiError::new(
            "auth_error",
            format!("鉴权失败（HTTP {}），请检查 API Key", status),
        ));
    }
    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        let preview: String = body.chars().take(200).collect();
        return Err(AiError::new(
            "api_error",
            format!("厂商接口返回 HTTP {}：{}", status, preview),
        ));
    }

    let data: Value = resp.json().await.map_err(|e| AiError::new("api_error", format!("响应解析失败：{}", e)))?;
    let content = data
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();
    if content.is_empty() {
        return Err(AiError::new("output_error", "模型返回内容为空".into()));
    }
    Ok(content)
}
