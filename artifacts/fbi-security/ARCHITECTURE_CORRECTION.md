# Architecture correction: ReDom-native feature

FBI Security reporting is a feature within the existing ReDom backend, not a standalone product/service.

- Source of truth repository: `ReDomApp/redom-backend`.
- Backend application: `artifacts/redom-backend` (existing TypeScript/Express API).
- Existing deployment: Render service `redom-backend`, attached to this repository. The feature should deploy through this existing service after the feature branch is reviewed and merged into the deployed branch.
- API prefix: `/redom-backend/fbi-security/*` and compatibility mount `/fbi-security/*` because the existing backend router is mounted under both paths.
- Persistence: existing Neon/PostgreSQL through the backend `pg` pool, using namespaced `redom_fbi_security_*` tables. No SQLite database or separate database service is used by the integration.
- New route module: `artifacts/redom-backend/src/routes/fbi-security.routes.ts`, mounted by `artifacts/redom-backend/src/routes/index.ts`.

The earlier Python/FastAPI proof-of-concept under this feature directory is not the deployment target. It should be treated as prototype/reference code only; do not create a separate Render service for it. Use the ReDom TypeScript route and shared backend database as the source of truth.

This integration currently exposes public-source cases, source registry, report drafts, conservative correlation candidates, analyst review status/notes, and audit events. It does not yet implement a complete automated feed poller. An authorized import process can submit a publicly available notice through the protected admin API. External official-source API integrations must use documented endpoints and the permissions applicable to them.

Before production release, run `pnpm --filter @workspace/redom-backend run typecheck` and the backend build from the repository root, review the SQL schema against existing migration/bootstrap patterns, confirm the admin secret in Render, inspect logs, and verify the deployed endpoint only after merging to the branch tracked by Render. No Render service is created by this feature branch and no deployment is claimed.