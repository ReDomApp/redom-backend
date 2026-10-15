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

An automatic scheduled official-feed poller and source-specific official RSS/API adapters are not yet complete. Before production release, run `pnpm --filter @workspace/redom-backend run typecheck` and `pnpm --filter @workspace/redom-backend run build` from repository root, confirm schema/bootstrap permissions and admin-secret setup, inspect Render deploy/runtime logs, and test the API on the deployed service only after merging to its configured branch.