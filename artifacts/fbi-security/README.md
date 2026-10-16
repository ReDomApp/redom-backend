# FBI Security reporting — ReDom backend feature

This directory holds the feature specification, allowlisted public sources, schema/report guidance, and security criteria. The running service is the existing ReDom backend, not a separate application.

## Runtime and source of truth

- Git source of truth: `ReDomApp/redom-backend`.
- Runtime: `artifacts/redom-backend` TypeScript/Express app.
- API: the existing Render service `redom-backend`.
- Data store: existing Neon/PostgreSQL, via `src/database/db.ts`'s shared pool.
- Implementation: `artifacts/redom-backend/src/routes/fbi-security.routes.ts`, mounted from `src/routes/index.ts`.
- Canonical API prefix: `/redom-backend/fbi-security`.

No extra Render service, standalone Python API, separate UI, or SQLite store should be deployed for this feature. The earlier Python scaffold has been removed from the feature branch. Render's live endpoint will only change after the normal merge/deploy path.

## API surface

- `GET /health` — feature health and indexed public-notice count.
- `GET /sources` — registered official public-source/reporting destinations.
- `GET /cases?q=...&reward_only=true&limit=50` — searchable public records.
- `GET /cases/:caseId` — record details.
- `GET /cases/number/:caseNumber` — retrieve a persistent record using its unique `FBI-YYYY-XXXXXXXXXXXX` case number.
- `POST /admin/cases/:caseId/corroborations` — fetch and store metadata from allowlisted official/news sources; requires the existing `x-redom-fbi-security-key` admin key.
- `GET /cases/:caseId/corroborations` — view corroboration sources for one exact case.
- `PATCH /admin/cases/:caseId/corroborations/:corroborationId` — record an analyst assessment (`supports_notice`, `contradicts_notice`, `unrelated`, or `needs_review`) with case-scoped matching.
- `GET /cases/:caseId/verification-report` — evidence-linked verification draft with source URLs, publisher/headline/date, SHA-256 hashes, analyst assessments, and uncertainties.
- Corroboration sources are limited to an explicit HTTPS host allowlist, fetched without following redirects, capped at 1.5 MB and 10 seconds, and stored under a foreign key to one case. Retrieved metadata is not treated as proof; analyst review is mandatory.
- `GET /cases/:caseId/report` — evidence-linked Markdown draft.
- `GET /correlations` — duplicate/cross-notice candidates; human review required.
- `POST /admin/ingest-url` — fetch and import a public page from the exact official-host allowlist, with HTTPS-only, redirect rejection, timeout, content-type and size limits.
- `POST /admin/cases` — import normalized fields from a trusted authorized ingestion client.
- `PATCH /admin/cases/:caseId/status` — update analyst-review status.
- `POST /admin/cases/:caseId/notes` and `GET /admin/cases/:caseId/notes` — add and read minimized analyst notes.
- `GET /admin/audit` — audit history.
- `POST /admin/tips` — submit a structured tip to an AES-256-GCM encrypted staging queue. Requires the admin key and a configured `FBI_SECURITY_TIP_ENCRYPTION_KEY`; this endpoint is not an unauthenticated public tip form.
- `GET /admin/tips?status=pending_review&limit=50` — list queue metadata without decrypting tip contents.
- `GET /admin/tips/:tipId` — decrypt one tip for an authorized administrator and return its public-source references; access is audited.
- `PATCH /admin/tips/:tipId` — update review status and analyst note.
- `POST /admin/tips/:tipId/sources` — attach up to 20 HTTPS source references from the explicit allowlist; this stores references and hashes but does not fetch or verify the pages.
- `POST /admin/tips/:tipId/verify-sources` — fetch only the URLs already attached to that tip, up to 20 sources, with an 8-second timeout, no redirects, HTTPS host allowlisting, HTML-only responses, and a 1 MB per-source cap; extract publisher/headline/description metadata and store a SHA-256 fingerprint for review.
- `GET /admin/tips/:tipId/sources` — view attached sources, retrieval status, extracted metadata, and content hashes.
- Tip payloads are encrypted with AES-256-GCM using a 32-byte key supplied as 64 hex characters or base64 in `FBI_SECURITY_TIP_ENCRYPTION_KEY`. Generate a dedicated key outside the repository, store it only in the existing Render service's secret environment, and maintain a protected backup/recovery procedure. Losing the key makes stored tip payloads unreadable. SHA-256 hashes are integrity fingerprints, not anonymization.

Admin routes require `REDOM_FBI_SECURITY_ADMIN_KEY` with at least 32 random characters in the existing Render backend environment. Encrypted tip intake additionally requires `FBI_SECURITY_TIP_ENCRYPTION_KEY` (32-byte AES key encoded as hex or base64). Keep both values out of Git and logs. If the relevant secret is not configured, the associated admin actions remain disabled.

## Current limits and release checklist

This is an independent reporting utility, not an official government system. It works with publicly released notices; it does not access restricted government, tax, financial, private account or private communications data, and it does not automatically submit tips. Reward extraction is heuristic, and case correlations are review candidates, not identity or guilt findings.

A scheduled worker is wired into the existing backend lifecycle and runs hourly when `FBI_SECURITY_WORKER_ENABLED=true`. On the profile-research branch, discovery starts only at `https://www.fbi.gov/wanted/most-wanted-fraudsters` and follows individual person-profile links hosted on `www.fbi.gov`. The backend-local parser at `artifacts/redom-backend/src/services/fbi-security/fbi-wanted-profile.ts` retains the complete visible notice text and extracts the fields for each person; `case-research-planner.ts` creates case-specific research tasks for official court/DOJ/SEC records, business registrations, public professional registrations, reward verification and reputable reporting. External public-web research occurs only after an individual profile is accepted as the anchor. OpenAI Responses web search uses `OPENAI_API_KEY`; Gemini Google Search grounding uses `GEMINI_API_KEY` (or `GOOGLE_GEMINI_API_KEY`). OpenAI transient HTTP 429 responses are retried with bounded backoff; exhausted quota triggers a cooldown and explicit billing/quota diagnostic. Gemini HTTP 404 triggers model discovery for the configured API key and a fallback to an available `generateContent` model when one exists. These mitigations cannot restore exhausted provider billing quota or grant model access absent from the account. The report distinguishes provider calls completed, partial provider failures, provider failures, and research not run; a successful model call is still not independently verified evidence. Parser fixture tests, backend typecheck/build and a live FBI profile smoke test are included in the new workflow. This feature branch remains subject to CI review and is not production behavior until merged and deployed.

Before production release, run `pnpm --filter @workspace/redom-backend run typecheck` and `pnpm --filter @workspace/redom-backend run build` from repository root, confirm schema/bootstrap permissions and admin-secret setup, inspect Render deploy/runtime logs, and test the API on the deployed service only after merging to its configured branch.

### AI-assisted public-web research configuration

- `OPENAI_API_KEY` enables OpenAI Responses API web search.
- `GEMINI_API_KEY` (or `GOOGLE_GEMINI_API_KEY`) enables Gemini grounded Google Search.
- `FBI_SECURITY_OPENAI_MODEL` and `FBI_SECURITY_GEMINI_MODEL` optionally override model defaults.
- `FBI_SECURITY_RESEARCH_ROUNDS` is clamped to 1–3. Each hourly run has a 55-minute maximum and a 12-case research cap; the report is sent after the pass finishes or the budget is reached.
- Results and provider errors are stored with case ID, provider, run key, and extracted source URLs in `redom_fbi_security_research_runs`. The email includes research output for review. A provider error is recorded, not treated as a clean search result.
- Configure provider keys only as secrets in the existing Render service. Never commit API keys. OpenAI/Gemini availability, model access, rate limits, and billing depend on the configured accounts.
