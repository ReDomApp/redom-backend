# FBI Security Intel

A public-source intelligence and reward-case monitoring workspace. This project lives entirely under `artifacts/fbi-security/`; it does not modify application backend, frontend, or other existing services.

## Goals

- Monitor official public announcements about wanted persons, fraud cases, enforcement actions, and rewards.
- Normalize each notice into a source-backed case record.
- Preserve source URL, publication/last-checked timestamps, exact reward wording, issuing agency, jurisdiction, and official submission destination.
- Separate facts stated by an agency from analyst notes and unverified public claims.
- Generate an evidence-linked report and open the correct official reporting page for a human to submit.
- Provide strong security controls and an auditable evidence trail.

## Privacy and access boundaries

This system is not an official government system and must never represent itself as one or imply affiliation with the FBI, DOJ, IRS, SEC, FTC, or another agency.

It must not attempt to obtain or infer non-public government data, SSNs, TINs, tax records, identity-document numbers, private bank/account details, private account-access history, non-public contact data, or precise private IP/location histories. Government systems and financial institutions are not public lookup sources. Store only information lawfully released by an official source or relevant information voluntarily submitted by an authorized user, with strict minimization.

The application must not automatically submit tips. It prepares evidence-linked drafts and opens official channels for a human to review and submit. It must not encourage surveillance, contact, confrontation, doxxing, or identity accusations based only on a resemblance or an unverified source.

## Initial scope

The scaffold documents architecture and security boundaries. It does not yet contain a running web application, crawler, database, or production deployment.

## Files

- `ARCHITECTURE.md`: proposed components and data flow.
- `SECURITY.md`: security controls and threat model.
- `sources/official-sources.json`: official public-source registry.
- `schemas/case-record.schema.json`: normalized case record schema.
- `reports/REPORT_TEMPLATE.md`: evidence-based report template.
- `submissions/SUBMISSION_WORKFLOW.md`: human-reviewed submission workflow.
- `ingestion/INGESTION_PLAN.md`: ingestion and verification implementation plan.
- `tests/ACCEPTANCE_TESTS.md`: security and functional acceptance criteria.

## Development principles

1. Allowlist sources; do not crawl arbitrary domains.
2. Respect source terms, rate limits, and robots directives where applicable.
3. Do not bypass logins, access controls, CAPTCHAs, or technical restrictions.
4. Every extracted claim must retain its source and timestamp.
5. No person-level conclusions from name matching alone.
6. Never publish sensitive data into Git history, logs, reports, issue trackers, or analytics.
7. Keep secrets in a managed secret store or environment variables, never in source control.
8. Human review is required before any submission or external action.
