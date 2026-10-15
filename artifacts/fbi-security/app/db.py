from __future__ import annotations
import json
import os
import sqlite3
from pathlib import Path
from typing import Any

DB_PATH = os.getenv("DATABASE_PATH", "./data/fbi_security.sqlite3")


def connect() -> sqlite3.Connection:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA busy_timeout=10000")
    return c


def init_db() -> None:
    with connect() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS cases (
          id TEXT PRIMARY KEY, agency TEXT NOT NULL, title TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT '[]', source_url TEXT NOT NULL UNIQUE,
          published_at TEXT, retrieved_at TEXT NOT NULL, content_sha256 TEXT,
          summary TEXT NOT NULL DEFAULT '', reward_advertised INTEGER NOT NULL DEFAULT 0,
          reward_amount_text TEXT, reward_exact_wording TEXT, reward_conditions TEXT NOT NULL DEFAULT '[]',
          tip_url TEXT, status TEXT NOT NULL DEFAULT 'new',
          source_kind TEXT NOT NULL DEFAULT 'official_source'
        );
        CREATE TABLE IF NOT EXISTS audit_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL,
          event_type TEXT NOT NULL, case_id TEXT, detail_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_cases_retrieved ON cases(retrieved_at DESC);
        CREATE INDEX IF NOT EXISTS idx_cases_reward ON cases(reward_advertised, retrieved_at DESC);
        """)
        c.commit()


def audit(event_type: str, case_id: str | None = None, detail: dict[str, Any] | None = None) -> None:
    from datetime import datetime, timezone
    with connect() as c:
        c.execute("INSERT INTO audit_events(created_at,event_type,case_id,detail_json) VALUES(?,?,?,?)",
                  (datetime.now(timezone.utc).isoformat(), event_type, case_id, json.dumps(detail or {}, sort_keys=True)))
        c.commit()


def upsert_case(record: dict[str, Any]) -> bool:
    """Returns True for insert/update; only public official notice fields are stored."""
    fields = ("id","agency","title","category","source_url","published_at","retrieved_at",
              "content_sha256","summary","reward_advertised","reward_amount_text",
              "reward_exact_wording","reward_conditions","tip_url","status","source_kind")
    row = dict(record)
    for key in ("category", "reward_conditions"):
        row[key] = json.dumps(row.get(key, []))
    row["reward_advertised"] = int(bool(row.get("reward_advertised")))
    with connect() as c:
        old = c.execute("SELECT content_sha256 FROM cases WHERE id=?", (row["id"],)).fetchone()
        c.execute(f"""INSERT INTO cases ({','.join(fields)}) VALUES ({','.join('?' for _ in fields)})
        ON CONFLICT(id) DO UPDATE SET {','.join(f'{k}=excluded.{k}' for k in fields if k != 'id')}""",
                  tuple(row.get(k) for k in fields))
        c.commit()
    return old is None or old["content_sha256"] != row.get("content_sha256")


def list_cases(q: str = "", reward_only: bool = False, limit: int = 200) -> list[dict[str, Any]]:
    clauses, args = [], []
    if q:
        clauses.append("(lower(title) LIKE ? OR lower(agency) LIKE ? OR lower(summary) LIKE ?)")
        term = "%" + q.lower()[:150] + "%"
        args.extend([term, term, term])
    if reward_only:
        clauses.append("reward_advertised=1")
    sql = "SELECT * FROM cases" + (" WHERE " + " AND ".join(clauses) if clauses else "") + " ORDER BY retrieved_at DESC LIMIT ?"
    args.append(max(1, min(int(limit), 500)))
    with connect() as c:
        rows = c.execute(sql, args).fetchall()
    out = []
    for r in rows:
        item = dict(r)
        for key in ("category", "reward_conditions"):
            item[key] = json.loads(item[key] or "[]")
        item["reward_advertised"] = bool(item["reward_advertised"])
        out.append(item)
    return out


def get_case(case_id: str) -> dict[str, Any] | None:
    found = next((x for x in list_cases(limit=500) if x["id"] == case_id), None)
    return found
