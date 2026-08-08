"""SQLite-backed chat session store (survives Local-RAG process restart)."""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parent / "data" / "sessions.db"


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            messages_json TEXT NOT NULL,
            updated_at REAL NOT NULL
        )
        """
    )
    c.commit()
    return c


def load_session(session_id: str) -> list[dict[str, Any]]:
    if not session_id:
        return []
    with _conn() as c:
        row = c.execute(
            "SELECT messages_json FROM sessions WHERE session_id=?", (session_id,)
        ).fetchone()
    if not row:
        return []
    try:
        data = json.loads(row[0])
        return data if isinstance(data, list) else []
    except Exception:
        return []


def save_session(session_id: str, messages: list[dict[str, Any]]) -> None:
    if not session_id:
        return
    payload = json.dumps(messages[-24:], ensure_ascii=False)
    with _conn() as c:
        c.execute(
            """
            INSERT INTO sessions(session_id, messages_json, updated_at)
            VALUES(?,?,?)
            ON CONFLICT(session_id) DO UPDATE SET
              messages_json=excluded.messages_json,
              updated_at=excluded.updated_at
            """,
            (session_id, payload, time.time()),
        )
        c.commit()


def delete_session(session_id: str) -> None:
    if not session_id:
        return
    with _conn() as c:
        c.execute("DELETE FROM sessions WHERE session_id=?", (session_id,))
        c.commit()


def session_count() -> int:
    with _conn() as c:
        return int(c.execute("SELECT COUNT(*) FROM sessions").fetchone()[0])
