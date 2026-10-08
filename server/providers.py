"""五家国内 AI 厂商预设 + 自定义 + Mock，以及 config.json 的读写与打码。"""
import json
import os
from pathlib import Path

CONFIG_PATH = Path(__file__).resolve().parent / "config.json"

PROVIDERS = [
    {
        "id": "glm",
        "name": "GLM 智谱",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "models": ["glm-4-flash", "glm-4-air"],
    },
    {
        "id": "deepseek",
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "models": ["deepseek-chat"],
    },
    {
        "id": "kimi",
        "name": "Kimi 月之暗面",
        "base_url": "https://api.moonshot.cn/v1",
        "models": ["moonshot-v1-8k", "kimi-k2-0905-preview"],
    },
    {
        "id": "minimax",
        "name": "MiniMax",
        "base_url": "https://api.minimaxi.com/v1",
        "models": ["MiniMax-M1", "abab6.5s-chat"],
    },
    {
        "id": "qwen",
        "name": "Qwen 阿里",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "models": ["qwen-turbo", "qwen-plus"],
    },
    {
        "id": "custom",
        "name": "自定义（OpenAI 兼容接口）",
        "base_url": "",
        "models": [],
    },
    {
        "id": "mock",
        "name": "Mock（离线联调，无需 Key）",
        "base_url": "",
        "models": ["mock-model"],
    },
]

_DEFAULTS = {p["id"]: p for p in PROVIDERS}


def load_settings() -> dict:
    """读取 config.json；文件不存在时返回 mock 默认配置。"""
    data = {}
    if CONFIG_PATH.exists():
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            data = {}
    preset = _DEFAULTS.get(data.get("provider", "mock"), _DEFAULTS["mock"])
    return {
        "provider": data.get("provider", "mock"),
        "base_url": data.get("base_url", ""),
        "model": data.get("model", ""),
        "api_key": data.get("api_key", ""),
        "_preset": preset,
    }


def save_settings(settings: dict) -> None:
    payload = {
        "provider": settings.get("provider", "mock"),
        "base_url": settings.get("base_url", ""),
        "model": settings.get("model", ""),
        "api_key": settings.get("api_key", ""),
    }
    CONFIG_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.chmod(CONFIG_PATH, 0o600)  # 密钥不落盘权限


def mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return key[:1] + "****"
    return key[:3] + "****" + key[-4:]


def public_settings() -> dict:
    """GET /api/settings 用的安全视图：密钥打码。"""
    st = load_settings()
    return {
        "provider": st["provider"],
        "base_url": st["base_url"] or st["_preset"].get("base_url", ""),
        "model": st["model"] or (st["_preset"].get("models") or [""])[0],
        "api_key_masked": mask_key(st["api_key"]),
        "has_key": bool(st["api_key"]),
    }


def resolved() -> dict:
    """实际调用用的配置：补全 base_url / model 默认值。"""
    st = load_settings()
    preset = st["_preset"]
    return {
        "provider": st["provider"],
        "base_url": st["base_url"] or preset.get("base_url", ""),
        "model": st["model"] or ((preset.get("models") or [""])[0]),
        "api_key": st["api_key"],
    }
