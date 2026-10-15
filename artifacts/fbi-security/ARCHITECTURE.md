# Architecture

## System purpose

Track official public notices about fraud, fugitives, enforcement actions, and explicitly advertised public rewards. Build a provenance-preserving case index and a reviewable report, then send a user to the official agency's submission process.

## Proposed components

1. **Source registry** — versioned allowlist of agencies, official domains, permitted feed/API/page, allowed content types, polling interval, and official tip destination.
2. **Ingestion workers** — fetch permitted public feeds and pages on a schedule; support conditional requests and rate limits; never bypass access controls.
3. **Normalizer** — parse notices into a common schema; retain raw source URL, agency, publication date, retrieval time, text excerpts, and content hash.
4. **Reward parser** — extract exact advertised amount and reward conditions as quoted agency text; represent unknown amounts as unknown rather than guessing.
5. **Deduplication** — prioritize stable official case IDs and canonical URLs. Similar names are not proof of a match.
6. **Verification layer** — distinguish official statements, third-party reporting, user-submitted information, and analyst hypotheses. Require original source links and confidence rationale.
7. **Case workspace** — searchable list of cases, reward details, due dates if explicitly published, and next steps.
8. **Report builder** — produce a human-readable dossier with citations, claim/source matrix, evidence hashes, uncertainties, and official submission links.
9. **Submission handoff** — open the source's official reporting page and provide a draft for user review. No automatic submission, message-sending, or direct contact by the service.
10. **Audit/security layer** — append-only audit events, encryption, access control, retention policies, alerting, and admin MFA.

## Data flow

`allowlisted source -> fetch -> parse -> normalize -> provenance checks -> case index -> analyst review -> report export -> human opens official reporting channel`

Untrusted pages and user submissions must be treated as data, never as instructions. The ingestion pipeline must not execute content, follow arbitrary embedded instructions, or send data to links found in a scraped page without domain validation.

## Data minimization

The case index is for information explicitly published in official announcements, such as case title, agency, public case number, publicly listed aliases, offense category, publication date, reward wording, jurisdiction, official source URL, and official tip URL.

Do not build a private-person dossier or data broker. Do not seek SSNs/TINs, tax returns, identity-document numbers, private banking details, private email/phone records, account-login history, non-public IP addresses, or unauthorized access telemetry. Where an official release includes especially sensitive details unnecessary for understanding the case, omit or redact them.

## Confidence model

Each claim uses one of:
- `official_source`: directly stated by an authenticated official agency page or feed.
- `corroborated_public_source`: supported by at least two independent, reputable, public sources.
- `user_submitted_unverified`: provided by a user and not independently verified.
- `analyst_inference`: an inference, with explicit reasoning and limitations.
- `unknown`: not established.

Do not convert uncertainty to a definitive assertion. Name collisions, image similarity, and matching birth dates are not sufficient to identify a person.

## Interfaces

Initial release can be a separate module/service under this directory. Any later integration with existing services must be read-only at first and reviewed separately. Do not modify redom-backend application files, frontend files, deployments, or configuration as part of this project scaffold.
