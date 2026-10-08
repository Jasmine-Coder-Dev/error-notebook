"""OpenAI 兼容客户端封装。区分：网络错误 / 鉴权失败 / 其他 API 错误。"""
from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI, OpenAIError


class AIError(Exception):
    """kind: network_error / auth_error / api_error"""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind
        self.message = message


async def chat(base_url: str, api_key: str, model: str, messages: list,
               temperature: float = 0.2, max_tokens: int = 2000, timeout: float = 60.0) -> str:
    if not base_url:
        raise AIError("config_error", "未配置 base_url")
    client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=timeout)
    try:
        resp = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except APIStatusError as e:
        if e.status_code in (401, 403):
            raise AIError("auth_error", f"鉴权失败（HTTP {e.status_code}），请检查 API Key") from e
        raise AIError("api_error", f"厂商接口返回 HTTP {e.status_code}：{e.message}") from e
    except (APIConnectionError, APITimeoutError) as e:
        raise AIError("network_error", f"连接厂商接口失败：{e}") from e
    except OpenAIError as e:
        raise AIError("api_error", f"OpenAI SDK 错误：{e}") from e

    content = resp.choices[0].message.content if resp.choices else None
    if not content:
        raise AIError("output_error", "模型返回内容为空")
    return content
