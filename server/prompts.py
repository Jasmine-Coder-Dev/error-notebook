"""四类 AI 任务的 Prompt 模板 + JSON 提取（正则兜底）+ 字段校验 + Mock 假数据。"""
import json
import re


class OutputError(Exception):
    """模型输出无法解析为合法 JSON / 字段不合法"""


# ---------------- Prompt 模板（均强制 JSON 输出） ----------------

SYSTEM_JSON = (
    "你是一名严谨的中小学教研助手。所有回答必须且只能是 JSON，"
    "不要输出任何 JSON 以外的文字、解释或 Markdown 代码块标记。"
)

PROMPT_TAG = """请为下面这道{grade}{term}学期{subject}题标注知识点。

要求：
1. 优先从给定知识点目录中挑选最贴切的，最多 5 个；
2. 目录确实没有合适的，可以补充自定义知识点，必须将 custom 置为 true；
3. 目录内的知识点 custom 置为 false；
4. 只输出 JSON，格式：{{"knowledge_points": [{{"name": "知识点名", "custom": false}}]}}

知识点目录（可选）：
{catalog}

题目：
{question}
"""

PROMPT_SOLVE = """请解答下面这道{grade}{term}学期{subject}题。

要求：
1. 答案要准确、简洁，适合中小学生理解；
2. 解析给出关键步骤和涉及的知识点；
3. 只输出 JSON，格式：{{"answer": "最终答案", "explanation": "解析过程"}}

题目：
{question}
"""

PROMPT_SIMILAR = """请根据下面的原题和知识点，生成 {count} 道同类型、同难度的练习题（变式，不要照抄原题）。

要求：
1. 每道题都附准确答案（必要时附简要解析）；
2. 题目表述完整、可独立作答；
3. 只输出 JSON，格式：{{"questions": [{{"text": "题目", "answer": "答案"}}]}}

原题：
{question}

知识点：{knowledge_points}
{grade}{term}{subject}

请生成 {count} 道同类题。
"""

PROMPT_SPLIT_CHECK = """下面是一份按题号从试卷中切分出的题目列表（JSON）。

请校对切分结果：
1. 被误切的题（一道题被拆成多条、或残留题号碎片）请合并为完整一道题；
2. 多条题目被粘连在一起的请拆开；
3. 明显不是题目内容的页眉、页脚、注意事项请剔除；
4. 为每题标注题型（选择题/填空题/判断题/计算题/应用题/解答题/默写题/写作题/阅读题/其他）；
5. 保持题目原有文字，只修正切分与题型，不要改写题目内容；
6. 只输出 JSON，格式：{{"items": [{{"text": "完整题目", "type": "题型"}}]}}

待校对题目：
{items}
"""


def build_messages(task: str, payload: dict, catalog: list) -> list:
    grade = payload.get("grade") or ""
    term = payload.get("term") or ""
    subject = payload.get("subject") or ""
    if task == "tag":
        user = PROMPT_TAG.format(
            grade=grade, term=term, subject=subject,
            catalog="\n".join(f"- {c}" for c in catalog) if catalog else "（无目录，可自行补充并标记 custom）",
            question=payload.get("question", ""),
        )
    elif task == "solve":
        user = PROMPT_SOLVE.format(grade=grade, term=term, subject=subject, question=payload.get("question", ""))
    elif task == "similar":
        kps = "、".join(payload.get("knowledge_points") or [])
        user = PROMPT_SIMILAR.format(
            count=int(payload.get("count") or 3),
            question=payload.get("question", ""),
            knowledge_points=kps or "未指定",
            grade=grade, term=term, subject=subject,
        )
    elif task == "split-check":
        user = PROMPT_SPLIT_CHECK.format(
            items=json.dumps(
                [{"index": i + 1, "text": it.get("text", "")} for i, it in enumerate(payload.get("items", []))],
                ensure_ascii=False, indent=2)
        )
    else:
        raise OutputError(f"未知任务类型: {task}")
    return [{"role": "system", "content": SYSTEM_JSON}, {"role": "user", "content": user}]


# ---------------- JSON 提取：解析失败时正则兜底 ----------------

def _extract_json(text: str):
    if not text or not text.strip():
        raise OutputError("模型返回为空")
    t = text.strip()
    # 1) 直接解析（或剥掉 ```json 围栏）
    m = re.search(r"```(?:json)?\s*(.*?)```", t, re.S)
    candidate = m.group(1).strip() if m else t
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass
    # 2) 兜底：截取第一个 { 到配对的 }（支持字符串内转义）
    start = t.find("{")
    if start == -1:
        raise OutputError("模型输出中未找到 JSON 对象")
    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(t)):
        c = t[i]
        if escape:
            escape = False
            continue
        if c == "\\":
            escape = True
            continue
        if c == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(t[start:i + 1])
                except json.JSONDecodeError as e:
                    raise OutputError(f"JSON 解析失败：{e}") from e
    raise OutputError("模型输出的 JSON 大括号不配对")


# ---------------- 字段校验 ----------------

def parse_tag(content: str) -> dict:
    data = _extract_json(content)
    kps = data.get("knowledge_points")
    if not isinstance(kps, list) or not kps:
        raise OutputError("knowledge_points 缺失或为空")
    out = []
    for item in kps[:8]:
        if isinstance(item, str) and item.strip():
            out.append({"name": item.strip(), "custom": True})
        elif isinstance(item, dict) and str(item.get("name", "")).strip():
            out.append({"name": str(item["name"]).strip(), "custom": bool(item.get("custom", False))})
    if not out:
        raise OutputError("knowledge_points 中没有合法条目")
    return {"knowledge_points": out}


def parse_solve(content: str) -> dict:
    data = _extract_json(content)
    answer = str(data.get("answer", "")).strip()
    explanation = str(data.get("explanation", "")).strip()
    if not answer and not explanation:
        raise OutputError("answer / explanation 均为空")
    return {"answer": answer, "explanation": explanation}


def parse_similar(content: str) -> dict:
    data = _extract_json(content)
    qs = data.get("questions")
    if not isinstance(qs, list) or not qs:
        raise OutputError("questions 缺失或为空")
    out = []
    for q in qs:
        if isinstance(q, dict) and str(q.get("text", "")).strip():
            out.append({"text": str(q["text"]).strip(), "answer": str(q.get("answer", "")).strip()})
    if not out:
        raise OutputError("questions 中没有合法条目")
    return {"questions": out}


def parse_split_check(content: str) -> dict:
    data = _extract_json(content)
    items = data.get("items")
    if not isinstance(items, list) or not items:
        raise OutputError("items 缺失或为空")
    out = []
    for it in items:
        if isinstance(it, dict) and str(it.get("text", "")).strip():
            out.append({"text": str(it["text"]).strip(), "type": str(it.get("type", "其他")).strip() or "其他"})
    if not out:
        raise OutputError("items 中没有合法条目")
    return {"items": out}


PARSERS = {
    "tag": parse_tag,
    "solve": parse_solve,
    "similar": parse_similar,
    "split-check": parse_split_check,
}


def parse_task(task: str, content: str) -> dict:
    try:
        return PARSERS[task](content)
    except OutputError:
        raise
    except Exception as e:  # 结构完全不符等兜底
        raise OutputError(f"模型输出结构异常：{e}") from e


# ---------------- Mock 厂商：离线假数据，全流程可联调 ----------------

_TYPE_RULES = [
    ("选择题", ["A.", "B.", "C.", "D.", "（ ）", "( )", "选择"]),
    ("判断题", ["判断", "对的打", "正确吗", "是否正确"]),
    ("填空题", ["填空", "______", "＿＿", "（　）", "横线上"]),
    ("计算题", ["计算", "直接写出得数", "竖式", "脱式", "口算"]),
    ("应用题", ["应用题", "多少千米", "多少元", "多少千克", "一共", "还剩"]),
    ("默写题", ["默写", "补充诗句", "根据课文"]),
    ("写作题", ["作文", "写一段话", "习作", "写一写"]),
    ("阅读题", ["阅读短文", "阅读理解", "读下面的"]),
    ("解答题", ["解方程", "证明", "求解", "解答"]),
]


def _guess_type(text: str) -> str:
    for t, keys in _TYPE_RULES:
        if any(k in text for k in keys):
            return t
    return "其他"


def mock_response(task: str, payload: dict) -> dict:
    if task == "tag":
        subject = payload.get("subject", "")
        base = {
            "语文": ["字词积累", "阅读理解"],
            "数学": ["基础运算", "应用题"],
            "英语": ["词汇运用", "语法"],
        }.get(subject, ["基础知识", "综合运用"])
        kps = [{"name": base[0], "custom": False}, {"name": base[1], "custom": False}]
        kps.append({"name": f"Mock 补充知识点（{subject or '综合'}）", "custom": True})
        return {"knowledge_points": kps}
    if task == "solve":
        return {
            "answer": "（Mock 答案）42",
            "explanation": "【Mock 解析】这是离线模拟数据：理解题意 → 找出数量关系 → 列式计算 → 检验作答。"
                           "配置真实厂商 Key 后将返回真实解答。",
        }
    if task == "similar":
        n = max(1, min(int(payload.get("count") or 3), 10))
        kp = "、".join(payload.get("knowledge_points") or ["综合"])
        src = (payload.get("question") or "原题")[:30]
        return {"questions": [
            {
                "text": f"【Mock 同类题 {i + 1}】围绕知识点「{kp}」、与原题（{src}…）同考点的变式练习。",
                "answer": f"【Mock 答案 {i + 1}】略。",
            }
            for i in range(n)
        ]}
    if task == "split-check":
        return {"items": [
            {"text": it.get("text", "").strip(), "type": _guess_type(it.get("text", ""))}
            for it in payload.get("items", []) if it.get("text", "").strip()
        ]}
    raise OutputError(f"未知任务类型: {task}")
