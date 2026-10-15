# Acceptance Tests

## Public-source and provenance
- [ ] Every case has an allowlisted official source URL, retrieval timestamp, and agency.
- [ ] Every extracted claim includes classification and source link.
- [ ] Reward amount and reward conditions are quoted from the official source or marked unknown.
- [ ] Duplicate official case notices are deduplicated without name-only matching.
- [ ] Stale or changed cases are flagged and require review.
- [ ] Non-official sources are visibly distinguished from official agency sources.

## Privacy
- [ ] No connector to IRS, Social Security, credit bureau, bank, identity data broker, or other restricted database is included.
- [ ] No workflow collects or enriches SSNs/TINs, tax records, identity-document numbers, bank account information, account-access logs, private phone/email, or private IP history.
- [ ] Logs redact evidence content and unnecessary personal data.
- [ ] Retention and deletion policies are tested.

## Security
- [ ] Arbitrary URL input is rejected.
- [ ] SSRF attempts to localhost, private, link-local, reserved, IPv6 local, and redirect-to-private addresses are rejected.
- [ ] Redirect chains are bounded and each destination revalidated.
- [ ] Malformed HTML/PDF and oversized decompressed payloads do not crash workers.
- [ ] Prompt-injection text in a source is treated as untrusted data and never executed.
- [ ] Requests are rate-limited and have connection/read timeouts.
- [ ] Secrets scan and dependency scan run in CI.
- [ ] Admin MFA and role-based access are required before production.

## Reporting
- [ ] Report drafts contain source-backed claims, uncertainties, and original source URLs.
- [ ] A human approval gate prevents automated submission.
- [ ] Submission links must match the official allowlist.
- [ ] The app does not identify individuals based on image resemblance or name matches alone.
- [ ] The interface states the system is independent and not an official government service.
