"""Human-review annotations for public-source case records."""
from __future__ import annotations
import re
from datetime import datetime, timezone
from .db import connect, get_case, audit

_ALLOWED_STATUSES = {"new", "under_review", "verified_public_source", "submitted_by_human", "closed"}
_MAX_NOTE = 3000
_RESTRICTED = re.compile(r"\b(?:SSN|social security number|TIN|taxpayer identification|bank account|routing number|password|access token)\b", re.I)

_SCHEMA = """CREATE TABLE IF NOT EXISTS analyst_notes (
 id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL,
 created_at TEXT NOT NULL, analyst_label TEXT NOT NULL, note TEXT NOT NULL,
 FOREIGN KEY(case_id) REFERENCES cases(id))"""

def add_note(case_id: str, note: str, analyst_label: str = "analyst") -> dict:
    if not get_case(case_id):
        raise KeyError("Case not found")
    clean = " ".join((note or "").split())
    if not clean or len(clean) > _MAX_NOTE:
        raise ValueError(f"Note must be between 1 and {_MAX_NOTE} characters.")
    if _RESTRICTED.search(clean):
        raise ValueError("Note appears to contain restricted financial, identity, or credential data; do not store it here.")
    now = datetime.now(timezone.utc).isoformat()
    label = (analyst_label or "analyst")[:80]
    with connect() as c:
        c.execute(_SCHEMA)
        cur = c.execute("INSERT INTO analyst_notes(case_id,created_at,analyst_label,note) VALUES(?,?,?,?)", (case_id, now, label, clean))
        note_id = cur.lastrowid
        c.commit()
    audit("analyst_note_added", case_id, {"note_id": note_id})
    return {"id": note_id, "case_id": case_id, "created_at": now, "analyst_label": label, "note": clean}

def list_notes(case_id: str) -> list[dict]:
    if not get_case(case_id):
        raise KeyError("Case not found")
    with connect() as c:
        c.execute(_SCHEMA)
        rows = c.execute("SELECT id,case_id,created_at,analyst_label,note FROM analyst_notes WHERE case_id=? ORDER BY id DESC LIMIT 100", (case_id,)).fetchall()
    return [dict(r) for r in rows]

def set_status(case_id: str, status: str) -> dict:
    if status not in _ALLOWED_STATUSES:
        raise ValueError("Unsupported status.")
    if not get_case(case_id):
        raise KeyError("Case not found")
    with connect() as c:
        c.execute("UPDATE cases SET status=? WHERE id=?", (status, case_id))
        c.commit()
    audit("case_status_changed", case_id, {"status": status})
    return {"case_id": case_id, "status": status}
