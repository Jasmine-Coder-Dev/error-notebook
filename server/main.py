"""FastAPI 入口：AI 代理 API + 题目 CRUD（SQLite）+ 静态托管 demo/ + CORS。

路径约定：
- demo 静态目录 / catalog.json 可通过环境变量 CUOTIJI_DEMO_DIR / CUOTIJI_CATALOG
  覆盖（PyInstaller 打包后由 launcher.py 指向 sys._MEIPASS 内的资源）；
- 数据库固定在 ~/.cuotiji/cuotiji.db（见 server/db.py）。
"""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import ai, db, prompts, providers

BASE_DIR = Path(__file__).resolve().parent
DEMO_DIR = Path(os.environ.get('CUOTIJI_DEMO_DIR') or (BASE_DIR.parent / 'demo'))
CATALOG_PATH = Path(os.environ.get('CUOTIJI_CATALOG') or (BASE_DIR / 'catalog.json'))
CATALOG = json.loads(CATALOG_PATH.read_text(encoding='utf-8'))

app = FastAPI(title="学生错题集 · 本地服务")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------- 请求模型 ----------------

class SettingsIn(BaseModel):
    provider: str = "mock"
    base_url: str = ""
    model: str = ""
    api_key: str = ""


class TagIn(BaseModel):
    question: str
    grade: str = ""
    term: str = ""
    subject: str = ""


class SolveIn(BaseModel):
    question: str
    grade: str = ""
    term: str = ""
    subject: str = ""


class SimilarIn(BaseModel):
    question: str
    knowledge_points: list[str] = Field(default_factory=list)
    count: int = 3
    grade: str = ""
    term: str = ""
    subject: str = ""


class SplitItem(BaseModel):
    text: str


class SplitIn(BaseModel):
    items: list[SplitItem]
    grade: str = ""
    term: str = ""
    subject: str = ""


# ---------------- 题目 CRUD（SQLite） ----------------

@app.get("/api/questions")
def list_questions(
    grade: str = Query(""),
    term: str = Query(""),
    subject: str = Query(""),
    kp: str = Query(""),
    mastery: str = Query(""),
    onlyWrong: bool = Query(False),
    keyword: str = Query(""),
):
    rows = db.list_questions({
        'grade': grade, 'term': term, 'subject': subject, 'kp': kp,
        'mastery': mastery, 'onlyWrong': onlyWrong, 'keyword': keyword,
    })
    return {'questions': rows, 'total': len(rows)}


@app.post("/api/questions")
def create_questions(body: Any = Body(...)):
    """单个或数组批量插入；字段服务端规范化校验，空题干跳过。"""
    items = body if isinstance(body, list) else [body]
    if not all(isinstance(it, dict) for it in items):
        raise HTTPException(400, detail={"type": "bad_request", "message": "请求体必须是题目对象或对象数组"})
    inserted = db.insert_many(items)
    return {'inserted': len(inserted), 'questions': inserted}


@app.put("/api/questions/{qid}")
def update_question(qid: str, body: dict):
    q = db.update_question(qid, body)
    if q is None:
        raise HTTPException(404, detail={"type": "not_found", "message": f"题目不存在：{qid}"})
    return q


@app.delete("/api/questions/{qid}")
def delete_question(qid: str):
    if not db.delete_question(qid):
        raise HTTPException(404, detail={"type": "not_found", "message": f"题目不存在：{qid}"})
    return {'deleted': True}


@app.get("/api/export")
def export_all():
    return {
        'app': 'cuotiji',
        'version': 2,
        'exportedAt': datetime.now().isoformat(timespec='seconds'),
        'questions': db.list_questions({}),
    }


@app.post("/api/import")
def import_all(body: Any = Body(...)):
    """全量导入（覆盖现有数据；覆盖确认由前端做）。"""
    arr = body if isinstance(body, list) else (body.get('questions') if isinstance(body, dict) else None)
    if not isinstance(arr, list):
        raise HTTPException(400, detail={"type": "bad_request", "message": "导入内容必须是题目数组或含 questions 字段的对象"})
    inserted = db.replace_all(arr)
    return {'imported': len(inserted)}


# ---------------- 配置类路由 ----------------

@app.get("/api/providers")
def get_providers():
    """厂商预设（不含密钥）。"""
    st = providers.load_settings()
    saved_key = st["api_key"]
    out = []
    for p in providers.PROVIDERS:
        item = {"id": p["id"], "name": p["name"], "base_url": p["base_url"], "models": p["models"]}
        item["has_key"] = bool(saved_key) if p["id"] == st["provider"] else False
        out.append(item)
    return {"providers": out}


@app.get("/api/settings")
def get_settings():
    return providers.public_settings()


@app.post("/api/settings")
def save_settings(body: SettingsIn):
    old = providers.load_settings()
    api_key = body.api_key
    # 前端回传打码值时保留原 Key
    if api_key and api_key == providers.mask_key(old["api_key"]):
        api_key = old["api_key"]
    settings = {"provider": body.provider, "base_url": body.base_url.strip(),
                "model": body.model.strip(), "api_key": api_key.strip()}
    if body.provider not in providers._DEFAULTS:
        raise HTTPException(400, detail={"type": "config_error", "message": f"未知厂商：{body.provider}"})
    providers.save_settings(settings)
    return providers.public_settings()


# ---------------- 知识点目录 ----------------

@app.get("/api/catalog")
def get_catalog(grade: str = Query(""), term: str = Query(""), subject: str = Query("")):
    points = []
    for entry in CATALOG:
        if grade and entry["grade"] != grade:
            continue
        if term and entry["term"] != term:
            continue
        if subject and entry["subject"] != subject:
            continue
        points.extend(entry["points"])
    # 去重保序
    seen = set()
    uniq = [p for p in points if not (p in seen or seen.add(p))]
    return {"knowledge_points": uniq}


def _catalog_for(payload: dict) -> list:
    for entry in CATALOG:
        if (entry["grade"] == payload.get("grade")
                and entry["term"] == payload.get("term")
                and entry["subject"] == payload.get("subject")):
            return entry["points"]
    return []


# ---------------- AI 任务统一执行 ----------------

async def run_task(task: str, payload: dict) -> dict:
    conf = providers.resolved()
    if conf["provider"] == "mock":
        return prompts.mock_response(task, payload)
    if not conf["api_key"]:
        raise HTTPException(400, detail={
            "type": "config_error",
            "message": "尚未配置 API Key，请在「AI 设置」中配置，或选择 Mock 厂商",
        })
    catalog = _catalog_for(payload) if task == "tag" else []
    messages = prompts.build_messages(task, payload, catalog)
    try:
        content = await ai.chat(conf["base_url"], conf["api_key"], conf["model"], messages)
    except ai.AIError as e:
        raise HTTPException(502, detail={"type": e.kind, "message": e.message}) from e
    try:
        return prompts.parse_task(task, content)
    except prompts.OutputError as e:
        raise HTTPException(502, detail={"type": "output_error", "message": str(e)}) from e


@app.post("/api/ai/test")
async def ai_test():
    """最小请求验证连通性。"""
    conf = providers.resolved()
    if conf["provider"] == "mock":
        return {"ok": True, "reply": "Mock 厂商：离线模式，无需 Key，全流程可联调。"}
    if not conf["api_key"]:
        raise HTTPException(400, detail={"type": "config_error", "message": "尚未配置 API Key"})
    try:
        content = await ai.chat(
            conf["base_url"], conf["api_key"], conf["model"],
            [{"role": "user", "content": "ping，请只回复 pong"}], max_tokens=10,
        )
    except ai.AIError as e:
        raise HTTPException(502, detail={"type": e.kind, "message": e.message}) from e
    return {"ok": True, "reply": content.strip()[:100]}


@app.post("/api/ai/tag")
async def ai_tag(body: TagIn):
    payload = body.model_dump()
    result = await run_task("tag", payload)
    result["catalog"] = _catalog_for(payload)
    return result


@app.post("/api/ai/solve")
async def ai_solve(body: SolveIn):
    return await run_task("solve", body.model_dump())


@app.post("/api/ai/similar")
async def ai_similar(body: SimilarIn):
    payload = body.model_dump()
    payload["count"] = max(1, min(payload.get("count") or 3, 10))
    return await run_task("similar", payload)


@app.post("/api/ai/split-check")
async def ai_split_check(body: SplitIn):
    return await run_task("split-check", body.model_dump())


# ---------------- 前端静态托管（须注册在所有 API 路由之后） ----------------

if DEMO_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DEMO_DIR), html=True), name="demo")
