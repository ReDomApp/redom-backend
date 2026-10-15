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
- `GET /cases/:caseId/report` — evidence-linked Markdown draft.
- `GET /correlations` — duplicate/cross-notice candidates; human review required.
- `POST /admin/ingest-url` — fetch and import a public page from the exact official-host allowlist, with HTTPS-only, redirect rejection, timeout, content-type and size limits.
- `POST /admin/cases` — import normalized fields from a trusted authorized ingestion client.
- `PATCH /admin/cases/:caseId/status` — update analyst-review status.
- `POST /admin/cases/:caseId/notes` and `GET /admin/cases/:caseId/notes` — add and read minimized analyst notes.
- `GET /admin/audit` — audit history.

Admin routes require `REDOM_FBI_SECURITY_ADMIN_KEY` with at least 32 random characters in the existing Render backend environment. Keep the value out of Git and logs. If it is not configured, admin actions remain disabled.

## Current limits and release checklist

This is an independent reporting utility, not an official government system. It works with publicly released notices; it does not access restricted government, tax, financial, private account or private communications data, and it does not automatically submit tips. Reward extraction is heuristic, and case correlations are review candidates, not identity or guilt findings.

A scheduled worker is now wired into the existing backend lifecycle. When enabled, it polls up to 20 explicitly configured HTTPS URLs on the exact official-host allowlist, rejects redirects, applies a 12-second timeout and 2 MB response limit, stores content hashes/provenance, and sends a daily Resend digest with aggregate counts and links. It uses a PostgreSQL advisory lock and a unique UTC-day run key to avoid duplicate digests across Render instances. This is URL polling, not a complete RSS/API adapter suite: add only documented official public feed/API URLs to `FBI_SECURITY_MONITOR_URLS`. The worker is disabled by default. Configure `FBI_SECURITY_WORKER_ENABLED=true`, comma-separated `FBI_SECURITY_MONITOR_URLS`, `FBI_SECURITY_ADMIN_EMAILS`, `RESEND_API_KEY`, and a verified `FBI_SECURITY_EMAIL_FROM` in the existing Render service. Set `FBI_SECURITY_PUBLIC_API_BASE_URL` only if the canonical API prefix differs. Set `REDOM_FBI_SECURITY_ADMIN_KEY` to a separate random secret of at least 32 characters for admin routes. No secrets belong in Git. Do not configure private or restricted-system endpoints. The worker does not access SSA, IRS, bank, credit bureau, private-account, or other restricted records; any future data connector must be separately authorized, documented, least-privileged, and disabled until approved credentials and legal authority are configured. Emails contain public notice metadata and report links only; official submissions remain human-controlled.

Before production release, run `pnpm --filter @workspace/redom-backend run typecheck` and `pnpm --filter @workspace/redom-backend run build` from repository root, confirm schema/bootstrap permissions and admin-secret setup, inspect Render deploy/runtime logs, and test the API on the deployed service only after merging to its configured branch.