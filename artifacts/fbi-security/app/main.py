from __future__ import annotations
import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .db import audit, get_case, init_db, list_cases
from .ingest import ingest_registry_homepages, ingest_url, registry
from .reporting import render_markdown
from .security import require_admin

BASE = Path(__file__).resolve().parents[1]

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="FBI Security Intel — Public Source Monitor", version="0.1.0",
              description="Independent public-source notice monitoring and evidence-linked reporting. Not an official government service.",
              docs_url=None if os.getenv("APP_ENV") == "production" else "/docs",
              redoc_url=None, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(BASE / "static")), name="static")

class IngestRequest(BaseModel):
    source_id: str = Field(min_length=1, max_length=80)
    url: str = Field(min_length=10, max_length=1000)

@app.get("/", response_class=HTMLResponse)
def home():
    return (BASE / "static" / "index.html").read_text(encoding="utf-8")

@app.get("/health")
def health():
    return {"status": "ok", "service": "fbi-security-intel", "mode": "public-source-monitor"}

@app.get("/api/sources")
def sources():
    return [{"id": s["id"], "agency": s["agency"], "homepage": s["homepage"],
             "tip_url": s.get("tip_url"), "categories": s.get("categories", [])}
            for s in registry()["sources"] if s.get("enabled")]

@app.get("/api/cases")
def cases(q: str = Query(default="", max_length=150), reward_only: bool = False,
          limit: int = Query(default=100, ge=1, le=500)):
    rows = list_cases(q=q, reward_only=reward_only, limit=limit)
    return {"count": len(rows), "cases": rows}

@app.get("/api/cases/{case_id}")
def case_detail(case_id: str):
    c = get_case(case_id)
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    return c

@app.get("/api/cases/{case_id}/report.md", response_class=PlainTextResponse)
def report(case_id: str):
    try:
        audit("report_generated", case_id)
        return render_markdown(case_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Case not found")

@app.post("/api/admin/ingest", dependencies=[Depends(require_admin)])
def admin_ingest(body: IngestRequest):
    try:
        result = ingest_url(body.source_id, body.url)
        audit("admin_ingest_requested", result["case_id"], {"source_id": body.source_id})
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Source ingestion failed ({type(exc).__name__}). Check source URL and server logs.")

@app.post("/api/admin/ingest-homepages", dependencies=[Depends(require_admin)])
def admin_ingest_homepages():
    return ingest_registry_homepages()

@app.get("/api/admin/audit", dependencies=[Depends(require_admin)])
def audit_events(limit: int = Query(default=100, ge=1, le=500)):
    from .db import connect
    with connect() as c:
        rows = c.execute("SELECT id,created_at,event_type,case_id,detail_json FROM audit_events ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]

@app.get("/api/reporting-links")
def reporting_links():
    return [{"agency": s["agency"], "case_list": s["homepage"], "tip_url": s.get("tip_url")}
            for s in registry()["sources"] if s.get("enabled")]
