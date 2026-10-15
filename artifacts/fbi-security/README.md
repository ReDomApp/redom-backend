# FBI Security reporting — ReDom backend feature

This directory contains the requirements, official-source registry, report template, and security/acceptance criteria for a capability implemented inside the existing ReDom backend. It is not a standalone app or Render service.

## Runtime architecture

- Source of truth: `ReDomApp/redom-backend`.
- Runtime: existing TypeScript/Express app at `artifacts/redom-backend`.
- API endpoint: existing Render service `redom-backend`.
- Persistence: existing Neon/PostgreSQL database, accessed through `artifacts/redom-backend/src/database/db.ts` and its shared `pool`.
- Feature routes: `artifacts/redom-backend/src/routes/fbi-security.routes.ts`, mounted in `src/routes/index.ts`.
- Intended canonical API prefix: `/redom-backend/fbi-security`.

Do not create a second FastAPI app, separate database, or extra Render service for this capability. The earlier Python scaffold was removed from the deployment path. `ARCHITECTURE_CORRECTION.md` and `RENDER_INTEGRATION.md` explain the deployment topology.

## Implemented API

- `GET /health` — feature health and indexed public-notice count.
- `GET /sources` — allowlisted official reporting/source destinations.
- `GET /cases?q=...&reward_only=true&limit=50` — public notice search.
- `GET /cases/:caseId` — public notice detail.
- `GET /cases/:caseId/report` — Markdown draft with source provenance and a review checklist.
- `GET /correlations` — potential duplicate/cross-notice candidates; every result requires human review.
- `POST /admin/cases` — import a record from an allowlisted official HTTPS hostname.
- `PATCH /admin/cases/:caseId/status` — set analyst-review state.
- `POST /admin/cases/:caseId/notes` — save minimized analyst notes.
- `GET /admin/audit` — recent audit events.

The admin endpoints require a high-entropy `REDOM_FBI_SECURITY_ADMIN_KEY` secret (at least 32 characters) configured through the existing Render backend service's environment settings. Never commit this secret. A missing secret disables admin operations. Current sources are public notices only; this feature does not retrieve restricted government/financial records and never automatically submits tips.

## Before production

The integration must pass `pnpm --filter @workspace/redom-backend run typecheck` and `pnpm --filter @workspace/redom-backend run build` from the repository root. Review SQL/bootstrap behavior and permissions against the live Neon schema. Confirm Render environment configuration and deployment logs only after merging into the branch configured for the existing service. A feature-branch commit does not change the live endpoint until the normal deploy path runs.

The current integration has public-notice import and reporting workflows; complete automatic official feed polling is not yet implemented. Any feed/API integration must use verified current official endpoints and their permitted access methods. This feature is an independent reporting utility and must not imply that ReDom is an official government system.
