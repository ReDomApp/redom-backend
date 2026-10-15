from __future__ import annotations
from .db import get_case


def render_markdown(case_id: str) -> str:
    c = get_case(case_id)
    if not c:
        raise KeyError("Case not found")
    reward = c["reward_exact_wording"] or "No exact reward wording was extracted. Check the official source."
    conditions = "\n".join(f"- {x}" for x in c["reward_conditions"]) or "- Not identified; consult the official source."
    return f"""# Public-Source Case Intelligence Report

> This is an independent draft, not an official government document. It contains public notice information only. Verify all details before reporting.

## Case
- **Agency:** {c['agency']}
- **Title:** {c['title']}
- **Record ID:** {c['id']}
- **Status:** {c['status']}
- **Published:** {c['published_at'] or 'Not extracted'}
- **Last checked (UTC):** {c['retrieved_at']}
- **Source:** {c['source_url']}

## Reward
- **Reward detected:** {'Yes — verify the current official terms' if c['reward_advertised'] else 'Not confirmed by extraction'}
- **Extracted amount text:** {c['reward_amount_text'] or 'Unknown'}
- **Exact extracted context:** {reward}
- **Possible conditions extracted:** 
{conditions}

Reward detection is heuristic. This report does not establish eligibility or guarantee payment.

## Public notice excerpt
{c['summary']}

## Provenance
- **Content SHA-256:** {c['content_sha256'] or 'Not available'}
- **Source classification:** {c['source_kind']}
- **Official reporting page:** {c['tip_url'] or 'Use the case page to find the correct reporting channel'}

## Review checklist
- [ ] Opened the original official source and confirmed the case is current.
- [ ] Confirmed exact reward conditions and deadlines with the agency.
- [ ] Separated direct observations from assumptions.
- [ ] Removed unnecessary personal information.
- [ ] Human reviewed the report before any submission.
- [ ] Submitted directly through the official channel, if appropriate.

Do not infer identity from name/photo similarity. Do not add SSNs, tax records, bank details, private contact information, private IP histories, or other restricted data.
"""
