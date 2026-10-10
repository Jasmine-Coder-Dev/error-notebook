//! 厂商预设与 config.json 读写，全量移植 server/providers.py。
//! config.json 格式与打码规则与 Python 版完全一致。

use std::collections::BTreeMap;

use serde_json::{json, Value};

use crate::db;

#[derive(Clone)]
pub struct Provider {
    pub id: &'static str,
    pub name: &'static str,
    pub base_url: &'static str,
    pub models: &'static [&'static str],
}

pub const PROVIDERS: &[Provider] = &[
    Provider { id: "glm", name: "GLM 智谱", base_url: "https://open.bigmodel.cn/api/paas/v4", models: &["glm-4-flash", "glm-4-air"] },
    Provider { id: "deepseek", name: "DeepSeek", base_url: "https://api.deepseek.com/v1", models: &["deepseek-chat"] },
    Provider { id: "kimi", name: "Kimi 月之暗面", base_url: "https://api.moonshot.cn/v1", models: &["moonshot-v1-8k", "kimi-k2-0905-preview"] },
    Provider { id: "minimax", name: "MiniMax", base_url: "https://api.minimaxi.com/v1", models: &["MiniMax-M1", "abab6.5s-chat"] },
    Provider { id: "qwen", name: "Qwen 阿里", base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: &["qwen-turbo", "qwen-plus"] },
    Provider { id: "custom", name: "自定义（OpenAI 兼容接口）", base_url: "", models: &[] },
    Provider { id: "mock", name: "Mock（离线联调，无需 Key）", base_url: "", models: &["mock-model"] },
];

fn config_path() -> std::path::PathBuf {
    db::data_dir().join("config.json")
}

fn default_config() -> BTreeMap<String, String> {
    let mut m = BTreeMap::new();
    m.insert("provider".into(), "mock".into());
    m.insert("base_url".into(), "".into());
    m.insert("model".into(), "".into());
    m.insert("api_key".into(), "".into());
    m
}

/// 对齐 providers.load_settings。
pub fn load_settings() -> BTreeMap<String, String> {
    let mut data = default_config();
    if let Ok(text) = std::fs::read_to_string(config_path()) {
        if let Ok(Value::Object(obj)) = serde_json::from_str::<Value>(&text) {
            for (k, v) in obj {
                if let Some(s) = v.as_str() {
                    data.insert(k, s.to_string());
                }
            }
        }
    }
    data
}

/// 对齐 providers.save_settings（chmod 600）。
pub fn save_settings(settings: &BTreeMap<String, String>) -> Result<(), String> {
    std::fs::create_dir_all(db::data_dir()).map_err(|e| e.to_string())?;
    let path = config_path();
    let payload = json!({
        "provider": settings.get("provider").cloned().unwrap_or_else(|| "mock".into()),
        "base_url": settings.get("base_url").cloned().unwrap_or_default(),
        "model": settings.get("model").cloned().unwrap_or_default(),
        "api_key": settings.get("api_key").cloned().unwrap_or_default(),
    });
    std::fs::write(&path, serde_json::to_string_pretty(&payload).unwrap())
        .map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// 对齐 providers.mask_key。
pub fn mask_key(key: &str) -> String {
    if key.is_empty() {
        return String::new();
    }
    if key.len() <= 8 {
        return format!("{}****", &key[..1]);
    }
    format!("{}****{}", &key[..3], &key[key.len() - 4..])
}

pub fn preset(id: &str) -> Option<&'static Provider> {
    PROVIDERS.iter().find(|p| p.id == id)
}

/// 对齐 providers.resolved：补全 base_url / model 默认值。
pub struct Resolved {
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
}

pub fn resolved() -> Resolved {
    let st = load_settings();
    let provider = st.get("provider").cloned().unwrap_or_else(|| "mock".into());
    let p = preset(&provider);
    Resolved {
        provider: provider.clone(),
        base_url: st.get("base_url").cloned().filter(|s| !s.is_empty())
            .or_else(|| p.map(|x| x.base_url.to_string())).unwrap_or_default(),
        model: st.get("model").cloned().filter(|s| !s.is_empty())
            .or_else(|| p.and_then(|x| x.models.first()).map(|s| s.to_string())).unwrap_or_default(),
        api_key: st.get("api_key").cloned().unwrap_or_default(),
    }
}

/// 对齐 providers.public_settings（密钥打码）。
pub fn public_settings() -> Value {
    let st = load_settings();
    let provider = st.get("provider").cloned().unwrap_or_else(|| "mock".into());
    let p = preset(&provider);
    let base_url = st.get("base_url").cloned().filter(|s| !s.is_empty())
        .or_else(|| p.map(|x| x.base_url.to_string())).unwrap_or_default();
    let model = st.get("model").cloned().filter(|s| !s.is_empty())
        .or_else(|| p.and_then(|x| x.models.first()).map(|s| s.to_string())).unwrap_or_default();
    let api_key = st.get("api_key").cloned().unwrap_or_default();
    json!({
        "provider": provider,
        "base_url": base_url,
        "model": model,
        "api_key_masked": mask_key(&api_key),
        "has_key": !api_key.is_empty(),
    })
}

/// GET /api/providers 负载。
pub fn providers_payload() -> Value {
    let st = load_settings();
    let saved_key = st.get("api_key").cloned().unwrap_or_default();
    let current_provider = st.get("provider").cloned().unwrap_or_default();
    let list: Vec<Value> = PROVIDERS
        .iter()
        .map(|p| {
            json!({
                "id": p.id,
                "name": p.name,
                "base_url": p.base_url,
                "models": p.models,
                "has_key": if p.id == current_provider { !saved_key.is_empty() } else { false },
            })
        })
        .collect();
    json!({ "providers": list })
}
