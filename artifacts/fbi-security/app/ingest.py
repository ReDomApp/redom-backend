from __future__ import annotations
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import feedparser
import httpx

from .db import audit, upsert_case
from .security import resolve_public_host, validate_allowlisted_url

BASE = Path(__file__).resolve().parents[1]
REGISTRY_PATH = BASE / "sources" / "official-sources.json"
TIMEOUT = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "15"))
MAX_BYTES = int(os.getenv("MAX_RESPONSE_BYTES", "2000000"))
USER_AGENT = "FBI-Security-Intel-Public-Notice-Monitor/0.1 (polite public-source monitoring)"


def registry() -> dict:
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def _host_set() -> set[str]:
    hosts = set()
    for src in registry()["sources"]:
        if src.get("enabled"):
            for key in ("homepage", "tip_url"):
                value = src.get(key)
                if value:
                    p = urlparse(value)
                    if p.hostname:
                        hosts.add(p.hostname.lower())
    return hosts


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _reward(text: str) -> tuple[bool, str | None, str | None, list[str]]:
    # Preserve exact context; do not promise eligibility or infer from unrelated dollar amounts.
    match = re.search(r"(?is)(.{0,180}(?:reward|up to\s*\$).{0,260})", text)
    excerpt = " ".join(match.group(1).split())[:600] if match else None
    amount = None
    if match:
        money = re.search(r"(?i)(?:up to\s*)?\$\s?[0-9][0-9,]*(?:\.\d{2})?", match.group(1))
        amount = money.group(0).strip() if money else None
    advertised = bool(match and amount and re.search(r"(?i)reward|offering|offers", match.group(1)))
    conditions = []
    if excerpt:
        for phrase in re.findall(r"(?i)(?:leading to|for information leading to|in exchange for)\s+[^.;]{3,140}", excerpt):
            conditions.append(" ".join(phrase.split())[:200])
    return advertised, amount, excerpt, conditions


def _safe_fetch(url: str) -> tuple[bytes, str]:
    validate_allowlisted_url(url, _host_set())
    host = urlparse(url).hostname or ""
    resolve_public_host(host)
    # Redirects are disabled so a trusted page cannot bounce the worker to an untrusted host.
    with httpx.Client(timeout=TIMEOUT, follow_redirects=False, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/rss+xml,application/atom+xml,application/xml"}) as client:
        response = client.get(url)
        if 300 <= response.status_code < 400:
            raise ValueError("Redirect encountered; verify the new URL manually and add it to the allowlist if official.")
        response.raise_for_status()
        if len(response.content) > MAX_BYTES:
            raise ValueError("Source response exceeds configured size limit.")
        ctype = response.headers.get("content-type", "").lower()
        if not any(t in ctype for t in ("text/html", "xml", "rss", "atom", "text/plain")):
            raise ValueError("Unsupported source content type.")
        return response.content, ctype


def _text(html: str) -> str:
    # Conservative text extraction, without executing scripts or loading remote assets.
    html = re.sub(r"(?is)<(script|style|noscript).*?>.*?</\1>", " ", html)
    html = re.sub(r"(?s)<!--.*?-->", " ", html)
    html = re.sub(r"(?s)<[^>]+>", " ", html)
    html = re.sub(r"&nbsp;|&#160;", " ", html, flags=re.I)
    html = re.sub(r"&amp;", "&", html, flags=re.I)
    html = re.sub(r"&quot;", '"', html, flags=re.I)
    html = re.sub(r"&#39;|&apos;", "'", html, flags=re.I)
    return re.sub(r"\s+", " ", html).strip()


def _record(src: dict, title: str, url: str, published: str | None, text: str) -> dict:
    retrieved = _now()
    normalized_url = url.split("#", 1)[0]
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    # Stable ID is based on agency + canonical source URL; no name-only identity matching.
    case_id = hashlib.sha256((src["id"] + "|" + normalized_url).encode()).hexdigest()[:24]
    reward, amount, exact, conditions = _reward(text)
    summary = text[:1800]
    return {
        "id": case_id, "agency": src["agency"], "title": title[:500] or "Untitled official notice",
        "category": src.get("categories", []), "source_url": normalized_url,
        "published_at": published, "retrieved_at": retrieved, "content_sha256": digest,
        "summary": summary, "reward_advertised": reward, "reward_amount_text": amount,
        "reward_exact_wording": exact, "reward_conditions": conditions,
        "tip_url": src.get("tip_url"), "status": "new", "source_kind": "official_source"
    }


def ingest_url(source_id: str, url: str) -> dict:
    """Fetch a URL only if its exact host is already in the official source allowlist."""
    src = next((s for s in registry()["sources"] if s["id"] == source_id and s.get("enabled")), None)
    if not src:
        raise ValueError("Unknown or disabled source ID.")
    raw, ctype = _safe_fetch(url)
    text = _text(raw.decode("utf-8", errors="replace"))
    title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", raw.decode("utf-8", errors="replace"))
    title = _text(title_match.group(1)) if title_match else src["agency"] + " public notice"
    record = _record(src, title, url, None, text)
    changed = upsert_case(record)
    audit("source_ingested" if changed else "source_checked", record["id"], {"source_id": source_id, "url": record["source_url"], "content_sha256": record["content_sha256"], "content_type": ctype})
    return {"case_id": record["id"], "title": record["title"], "changed": changed, "reward_advertised": record["reward_advertised"], "source_url": record["source_url"]}


def ingest_registry_homepages() -> dict:
    results, errors = [], []
    for src in registry()["sources"]:
        if not src.get("enabled") or not src.get("homepage"):
            continue
        try:
            results.append(ingest_url(src["id"], src["homepage"]))
        except Exception as exc:
            # Error message is intentionally short; never store fetched page content in logs.
            errors.append({"source_id": src["id"], "error": str(exc)[:300]})
            audit("source_error", None, {"source_id": src["id"], "error_type": type(exc).__name__})
    return {"ingested": len(results), "results": results, "errors": errors}


def parse_feed_entries(source_id: str, feed_url: str, xml_bytes: bytes) -> int:
    """Utility for a future approved RSS adapter; feed URL must already be allowlisted."""
    src = next((s for s in registry()["sources"] if s["id"] == source_id), None)
    if not src:
        raise ValueError("Unknown source ID.")
    feed = feedparser.parse(xml_bytes)
    count = 0
    for entry in feed.entries[:100]:
        url = getattr(entry, "link", "")
        if not url:
            continue
        # Feed links are untrusted: only exact official hosts can be ingested.
        try:
            validate_allowlisted_url(url, _host_set())
            text = " ".join([getattr(entry, "title", ""), getattr(entry, "summary", "")])
            record = _record(src, getattr(entry, "title", "Official notice"), url, getattr(entry, "published", None), text)
            upsert_case(record)
            count += 1
        except ValueError:
            continue
    return count
