"""SQLite 数据层（标准库 sqlite3，无 ORM）。

数据库文件固定放用户目录 ~/.cuotiji/cuotiji.db——打包后的 exe/app 可能位于只读目录，
不能依赖 exe 旁边；同时该目录供 app.log 使用。
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
from datetime import datetime
from pathlib import Path

GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
          '七年级', '八年级', '九年级', '高一', '高二', '高三']
TERMS = ['上', '下']
SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治']
MASTERY = ['未掌握', '复习中', '已掌握']

DATA_DIR = Path(os.environ.get('CUOTIJI_DATA_DIR') or (Path.home() / '.cuotiji'))
DB_PATH = DATA_DIR / 'cuotiji.db'
LOG_PATH = DATA_DIR / 'app.log'

_SCHEMA = """
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
"""


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_conn() -> sqlite3.Connection:
    ensure_data_dir()
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    return conn


def gen_id() -> str:
    return f"{int(datetime.now().timestamp() * 1000):x}{os.urandom(4).hex()}"


def normalize(data: dict) -> dict:
    """字段规范化（对齐前端原 storage.js 的 normalize 行为）。"""
    kp_raw = data.get('knowledgePoints', data.get('knowledge_points', []))
    if isinstance(kp_raw, str):
        kps = [s.strip() for s in re.split(r'[,，、]', kp_raw) if s.strip()]
    elif isinstance(kp_raw, list):
        kps = [str(s).strip() for s in kp_raw if str(s).strip()]
    else:
        kps = []
    grade = data.get('grade') or ''
    term = data.get('term') or ''
    subject = data.get('subject') or ''
    mastery = data.get('mastery') or ''
    created = data.get('createdAt', data.get('created_at', ''))
    if not created:
        created = datetime.now().isoformat(timespec='seconds')
    return {
        'id': str(data.get('id') or gen_id()),
        'text': str(data.get('text') or ''),
        'answer': str(data.get('answer') or ''),
        'grade': grade if grade in GRADES else (grade or GRADES[0]),
        'term': term if term in TERMS else (term or TERMS[0]),
        'subject': subject if subject in SUBJECTS else (subject or SUBJECTS[1]),
        'knowledgePoints': kps,
        'isWrong': bool(data.get('isWrong', data.get('is_wrong', False))),
        'wrongReason': str(data.get('wrongReason', data.get('wrong_reason', '')) or ''),
        'mastery': mastery if mastery in MASTERY else '未掌握',
        'sourceFile': str(data.get('sourceFile', data.get('source_file', '')) or ''),
        'createdAt': str(created),
    }


def row_to_q(row: sqlite3.Row) -> dict:
    d = dict(row)
    try:
        kps = json.loads(d.get('knowledge_points') or '[]')
        if not isinstance(kps, list):
            kps = []
    except (json.JSONDecodeError, TypeError):
        kps = []
    return {
        'id': d['id'],
        'text': d['text'],
        'answer': d['answer'],
        'grade': d['grade'],
        'term': d['term'],
        'subject': d['subject'],
        'knowledgePoints': kps,
        'isWrong': bool(d['is_wrong']),
        'wrongReason': d['wrong_reason'],
        'mastery': d['mastery'],
        'sourceFile': d['source_file'],
        'createdAt': d['created_at'],
    }


def list_questions(f: dict | None = None) -> list:
    """服务端组合筛选：grade/term/subject/kp/mastery/onlyWrong/keyword。"""
    f = f or {}
    cond, params = [], []
    if f.get('grade'):
        cond.append('grade = ?')
        params.append(f['grade'])
    if f.get('term'):
        cond.append('term = ?')
        params.append(f['term'])
    if f.get('subject'):
        cond.append('subject = ?')
        params.append(f['subject'])
    if f.get('kp'):
        cond.append("knowledge_points LIKE ?")
        params.append(f'%"{f["kp"]}"%')
    if f.get('mastery'):
        cond.append('mastery = ?')
        params.append(f['mastery'])
    if f.get('onlyWrong'):
        cond.append('is_wrong = 1')
    if f.get('keyword'):
        kw = f'%{f["keyword"]}%'
        cond.append('(text LIKE ? OR answer LIKE ? OR wrong_reason LIKE ? OR knowledge_points LIKE ?)')
        params += [kw, kw, kw, kw]
    sql = 'SELECT * FROM questions' + (' WHERE ' + ' AND '.join(cond) if cond else '') + ' ORDER BY rowid'
    with get_conn() as conn:
        return [row_to_q(r) for r in conn.execute(sql, params).fetchall()]


def _insert(conn: sqlite3.Connection, q: dict) -> None:
    conn.execute(
        'INSERT OR REPLACE INTO questions (id, text, answer, grade, term, subject, '
        'knowledge_points, is_wrong, wrong_reason, mastery, source_file, created_at) '
        'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        (q['id'], q['text'], q['answer'], q['grade'], q['term'], q['subject'],
         json.dumps(q['knowledgePoints'], ensure_ascii=False),
         1 if q['isWrong'] else 0, q['wrongReason'], q['mastery'],
         q['sourceFile'], q['createdAt']))


def insert_many(items: list) -> list:
    """批量插入（跳过空题干），返回规范化后的入库题目。"""
    inserted = [normalize(it) for it in items if isinstance(it, dict)]
    inserted = [q for q in inserted if q['text']]
    if inserted:
        with get_conn() as conn:
            for q in inserted:
                _insert(conn, q)
            conn.commit()
    return inserted


def get_question(qid: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute('SELECT * FROM questions WHERE id = ?', (qid,)).fetchone()
    return row_to_q(row) if row else None


def update_question(qid: str, patch: dict) -> dict | None:
    existing = get_question(qid)
    if existing is None:
        return None
    merged = normalize({**existing, **patch, 'id': qid})
    with get_conn() as conn:
        _insert(conn, merged)
        conn.commit()
    return merged


def delete_question(qid: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute('DELETE FROM questions WHERE id = ?', (qid,))
        conn.commit()
        return cur.rowcount > 0


def replace_all(items: list) -> list:
    """全量替换（导入 JSON / 加载示例数据用）。"""
    inserted = [normalize(it) for it in items if isinstance(it, dict)]
    inserted = [q for q in inserted if q['text']]
    with get_conn() as conn:
        conn.execute('DELETE FROM questions')
        for q in inserted:
            _insert(conn, q)
        conn.commit()
    return inserted


def count() -> int:
    with get_conn() as conn:
        return conn.execute('SELECT COUNT(*) FROM questions').fetchone()[0]
