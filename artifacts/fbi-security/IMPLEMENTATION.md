# Isolated full-profile research implementation

The parser and planner live inside `artifacts/redom-backend/src/services/fbi-security/` and are wired into the existing backend worker on this branch. Tests and fixture live under `artifacts/fbi-security/`. No ReDom frontend files are edited; this branch is not deployed.

## Components

- `artifacts/redom-backend/src/services/fbi-security/fbi-wanted-profile.ts`: reads the complete visible content of an individual FBI Wanted profile; extracts name/title, aliases, DOB-used field, birthplace, physical descriptors, reward wording, remarks, caution, field office, tip instructions and individual profile links. It preserves full text and warnings for fields that do not parse cleanly.
- `artifacts/redom-backend/src/services/fbi-security/case-research-planner.ts`: derives bounded research tasks for criminal docket/indictment, civil/regulatory cases, official business registrations, public professional registrations, reward corroboration and reputable reporting. Each task carries the subject/case identifiers and required evidence.
- Existing `README.md`: describes the current backend feature and its production API. This implementation is an isolated proposal and does not alter that runtime.

## Workflow

1. Start only at `https://www.fbi.gov/wanted/most-wanted-fraudsters`.
2. Discover eligible individual profile URLs on `www.fbi.gov`; do not treat the index as a case.
3. Read each profile's full visible text and preserve the exact source URL and retrieval timestamp.
4. Create a one-person research plan from the notice's own aliases, case numbers, named entities, charges, jurisdictions, dates and other published identifiers.
5. Search official court, DOJ, SEC, regulator, business registry and professional registration records first; use reputable news reporting as secondary corroboration.
6. Record each source's title, URL, publisher, date, exact supported fact, identifiers matching the same case, allegation/finding classification, confidence and limitations.
7. Audit reward amount/conditions separately. A civil penalty, restitution amount or damages figure is not a reward. A maximum reward is not a guaranteed payout.
8. Leave same-name-only matches unresolved; keep allegations distinct from findings and convictions.
9. Require human review before any official submission; no automatic tip submission.

## Public credentials only

“Credentials” here means publicly documented professional registration/credential claims and official business records relevant to the public case. It does not mean passwords, authentication tokens, SSNs, tax records, private banking/brokerage records, private account histories or restricted government records. Do not use data brokers, people-search sites, relatives, family trees, private contact details or private addresses.

## Integration gate

Before integration, add representative HTML fixtures and tests for each extracted field, verify current FBI markup, run the backend typecheck/build, add structured persistence with source provenance and enforce a report gate that blocks any report claiming research is complete when provider calls failed. Validate OpenAI/Gemini credentials, accessible models and quota independently. The profile reader itself does not fix provider 429/404 failures. No production behavior changes until this directory is explicitly wired into the worker and the change is reviewed, merged and deployed.
