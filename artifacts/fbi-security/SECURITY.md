# Security Model

## Security objectives

Confidentiality, integrity, availability, provenance, accountability, safe reporting, and protection against false-positive person matches.

## Threat model

- Malicious or compromised source websites.
- Prompt injection embedded in pages, PDFs, images, or user-submitted evidence.
- Forged reward posters and phishing domains impersonating official agencies.
- Unauthorized access to reports and user-submitted evidence.
- Credential leakage, API-key exposure, dependency compromise, and CI compromise.
- Data poisoning, duplicate identities, stale sightings, and malicious accusations.
- SSRF, arbitrary URL fetching, parser exploits, oversized files, and malicious documents.
- Insider misuse or over-collection of personally identifiable information.

## Mandatory controls before production

### Identity and access
- Require MFA for administrators and privileged users.
- Use least-privilege RBAC with separate reviewer and administrator permissions.
- Use short-lived credentials where possible and rotate service credentials.
- Never commit secrets, API tokens, session cookies, or private evidence to Git.
- Avoid shared admin accounts; log privileged actions.

### Application and network
- Enforce HTTPS and secure transport settings.
- Apply CSRF protection, strict security headers, output encoding, and secure cookie settings.
- Validate requests with typed schemas and size limits.
- Defend against SSRF: allowlist official domains, block private/link-local/loopback/reserved IP ranges, revalidate DNS and redirects, and limit protocols to HTTPS.
- Apply timeouts, rate limits, concurrency limits, and decompression limits.
- Run parsers in a sandbox with minimal filesystem and network privileges.
- Treat all fetched content as untrusted data. Never execute scripts or follow instructions inside scraped content.
- Pin and review dependencies; scan dependencies, containers, and source changes in CI.
- Use a documented patch and incident-response process.

### Data protection
- Collect only public case information needed for the stated task.
- Do not retrieve or infer non-public SSNs, TINs, IRS records, identity numbers, bank/account data, account access histories, private contact information, private IP histories, or restricted government data.
- Encrypt sensitive user-submitted evidence in transit and at rest, segregate keys, and apply least-privilege access.
- Redact unnecessary personal data from logs. Avoid logging entire reports or uploaded evidence.
- Use short, documented retention periods and deletion workflows.
- Do not include raw evidence or personal information in telemetry, crash reports, GitHub issues, or public exports.
- Use cryptographic hashes and metadata for integrity checking; a hash proves file consistency, not factual truth.

### Source integrity and anti-fraud
- Allowlist official agency domains and verify TLS certificates.
- Treat social posts and third-party pages as leads, not authoritative fact.
- Store canonical URL, retrieval time, publication time, and content hash.
- Preserve exact quoted reward terms and link directly to the responsible agency's page.
- Never guarantee a reward or claim that the user is an authorized agent.
- Flag outdated records, changed reward values, and broken URLs for review.

### Reporting safeguards
- Reports must identify source-backed facts separately from assumptions and user-provided unverified information.
- Require a human reviewer before external submission.
- Open only agency-verified reporting URLs; never submit tips automatically.
- Do not create or publish accusation pages, face-recognition matches, or suspect location predictions.
- Do not encourage approaching, tracking, harassing, or confronting subjects.

## Operational readiness checklist

- [ ] Threat model reviewed and signed off.
- [ ] Privacy impact assessment completed.
- [ ] Source allowlist reviewed.
- [ ] Authentication, MFA, and RBAC tested.
- [ ] SSRF and malicious-content tests passed.
- [ ] Data retention and deletion implemented.
- [ ] Secrets scanning and dependency scanning enabled.
- [ ] Audit logs are access-controlled and tamper-evident.
- [ ] Backups encrypted and restore-tested.
- [ ] Incident-response runbook established.
- [ ] Human-review gate and official URL validation tested.
- [ ] No production claim of “supersonic security”; security must be demonstrated by tests and independent review.
