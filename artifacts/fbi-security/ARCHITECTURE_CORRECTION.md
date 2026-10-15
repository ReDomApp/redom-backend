# ReDom-native architecture

FBI Security reporting is a feature of the existing ReDom backend. It is not a standalone project, API server, or Render service.

- **Source of truth:** `ReDomApp/redom-backend`.
- **Runtime:** `artifacts/redom-backend`, TypeScript/Express.
- **Render endpoint:** the existing `redom-backend` service.
- **Database:** the existing Neon PostgreSQL database via the backend `pool` in `src/database/db.ts`.
- **Route module:** `artifacts/redom-backend/src/routes/fbi-security.routes.ts`.
- **Route registration:** `artifacts/redom-backend/src/routes/index.ts`.
- **Canonical API path:** `/redom-backend/fbi-security/*`; this works through the existing `/redom-backend` mount.

The earlier standalone Python/FastAPI scaffold, SQLite configuration, and standalone dashboard were removed from this feature branch. Do not provision a separate service or database for this feature.

The integrated API now provides a public agency/source registry, public-notice list/detail, Markdown report drafting, conservative candidate correlations, protected manual notice imports, review-status changes, analyst notes, and audit events. Automatic official feed polling remains unfinished. Source records must come from current official public notices and verified documented APIs; the feature does not query restricted private systems or auto-submit reports.

Before release, typecheck/build the existing backend, review schema permissions and migration behavior, configure the admin secret in the existing Render service, and confirm the deployment after merge to the service's configured branch. Feature-branch commits are not live deployments.