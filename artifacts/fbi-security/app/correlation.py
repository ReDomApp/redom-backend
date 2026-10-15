from __future__ import annotations
import re
from collections import defaultdict
from typing import Any

CASE_ID_PATTERNS = (re.compile(r"\b(?:case|docket|indictment|complaint|release)\s*(?:no\.?|number|#|:)?\s*([A-Z]{1,8}[-/ ]?\d{2,}(?:[-/]\d+)*)\b", re.I), re.compile(r"\b(?:USMS|FBI|SEC|FTC|DOJ)[-/ ]\d{2,}(?:[-/]\d+)*\b", re.I))

def explicit_case_ids(text: str) -> set[str]:
    found = set()
    for pattern in CASE_ID_PATTERNS:
        for match in pattern.finditer(text or ""):
            value = match.group(1) if match.lastindex else match.group(0)
            found.add(re.sub(r"\s+", "-", value).upper())
    return found

def _normal_title(value: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", value.casefold()).split())

def correlate_cases(cases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Candidate review groups from exact digests, explicit case IDs, or exact titles."""
    buckets = defaultdict(list)
    titles = defaultdict(list)
    for case in cases:
        cid = str(case.get("id", ""))
        digest = str(case.get("content_sha256") or "")
        if digest:
            buckets[("content_sha256", digest)].append(cid)
        title = _normal_title(str(case.get("title") or ""))
        text = str(case.get("title") or "") + " " + str(case.get("summary") or "")
        for external_id in explicit_case_ids(text):
            buckets[("explicit_case_id", external_id)].append(cid)
        if len(title) >= 18:
            titles[title].append(cid)
    for title, ids in titles.items():
        if len(ids) > 1:
            buckets[("exact_normalized_title", title)].extend(ids)
    groups, seen = [], set()
    for (kind, key), ids in buckets.items():
        ids = sorted(set(ids))
        signature = (kind, tuple(ids))
        if len(ids) < 2 or signature in seen:
            continue
        seen.add(signature)
        groups.append({"match_type": kind, "match_key": key, "case_ids": ids, "requires_human_review": True, "warning": "Candidate correlation only; never infer identity or wrongdoing from this match."})
    return sorted(groups, key=lambda x: (x["match_type"], x["case_ids"]))
