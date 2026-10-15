# Ingestion Plan

## First implementation milestone

- Read enabled source definitions from `sources/official-sources.json`.
- Enforce HTTPS host allowlisting before each request and each redirect.
- Use permitted public feeds/APIs where available; otherwise use conservative public-page polling.
- Store source timestamps and a SHA-256 digest of normalized page content.
- Extract candidate title, case ID, agency, publish date, reward wording, conditions, and official destination.
- Require review for ambiguous reward amounts, outdated announcements, name matches, and changed source pages.

## Fetcher safety requirements

- Accept source IDs, not arbitrary user-entered URLs.
- Resolve DNS and reject loopback, private, link-local, multicast, and reserved destinations.
- Revalidate DNS and the host at each redirect; cap redirects and response size.
- Use strict connection/read timeouts and a global rate limit.
- Do not send cookies or credentials to source websites.
- Do not use browser automation to bypass access restrictions, authentication, paywalls, or bot defenses.
- Disable script execution and do not invoke tools or services based on page text.
- Parse documents in resource-limited processes and reject unsupported formats.

## Reward detection

Reward amounts must come from exact official text and remain verbatim in the record. Do not infer eligibility from headline amounts. Distinguish:
- advertised reward for information leading to arrest;
- reward for information leading to arrest and conviction;
- whistleblower award based on a separate statutory/program process;
- no reward identified;
- unclear/needs manual review.

## Deduplication and stale-case detection

Prefer official case numbers and canonical URLs. Never automatically merge records solely because names, faces, birth dates, or other identifiers are similar. Mark cases stale when the official source is removed, an agency update changes status, or scheduled checks fail repeatedly; require review before declaring a case closed.

## Reporting

Provide source citations and a claim/source table. Reports are drafts only. The submitter must review and submit through the official agency destination manually.
