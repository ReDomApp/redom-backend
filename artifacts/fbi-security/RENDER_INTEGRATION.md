# Render deployment and endpoint

The feature is integrated into the existing Render web service named `redom-backend` (service ID `srv-da4kcimk1f9s73ekaeqg`, current branch `main`), whose source repository is `ReDomApp/redom-backend` and whose configured health path is `/redom-backend/healthz`.

No new Render service should be created for this feature. Render deploys the existing service from its configured branch. Until this feature branch is merged into `main` (or Render is explicitly changed to track this feature branch), its routes are not deployed on the live service.

After the change is merged and deployed, API routes will be available under:

- `https://redom-backend.onrender.com/redom-backend/fbi-security/health`
- `https://redom-backend.onrender.com/redom-backend/fbi-security/sources`
- `https://redom-backend.onrender.com/redom-backend/fbi-security/cases`
- `https://redom-backend.onrender.com/redom-backend/fbi-security/correlations`

The backend also mounts its base router at `/`, so the unprefixed compatibility paths may also resolve; the canonical integration path is `/redom-backend/fbi-security`.

The protected administrative import/status/note/audit routes require `REDOM_FBI_SECURITY_ADMIN_KEY` to be configured in the existing Render backend environment. Do not put that value in GitHub or in this document. The feature remains unavailable for admin operations until the secret is configured. Public reads only expose the public notice record metadata and report draft. Human review is required before external reporting.

Deployment status must be confirmed from Render deploys/logs after a merge; committing to a feature branch alone is not a deployment.
## Scheduled processing and email

The worker is part of the existing backend process and is disabled unless `FBI_SECURITY_WORKER_ENABLED=true`. Configure these values in the existing Render service's environment (never in Git):

- `FBI_SECURITY_WORKER_ENABLED=true`
- `FBI_SECURITY_MONITOR_URLS` — comma-separated official public HTTPS URLs, maximum 20; each URL host must be on the allowlist. The worker rejects redirects, enforces a 12-second timeout and 2 MB response cap, and refreshes public notice records/provenance.
- `FBI_SECURITY_ADMIN_EMAILS` — comma-separated administrator recipients.
- `RESEND_API_KEY` — existing Resend API key.
- `FBI_SECURITY_EMAIL_FROM` — verified sender identity in Resend.
- `FBI_SECURITY_PUBLIC_API_BASE_URL=https://redom-backend.onrender.com/redom-backend/fbi-security` (optional; this is the default).
- `REDOM_FBI_SECURITY_ADMIN_KEY` — separate random secret of at least 32 characters for protected admin APIs.

The worker uses the existing PostgreSQL pool, advisory locking, and a UTC daily run key. Its digest contains public notice metadata, aggregate counts, and links only. It does not send analyst notes or restricted identity/financial data. If email settings are absent, the digest is not sent. URL polling is not a substitute for documented agency RSS/API integrations. No private government/financial system access or automatic official tip submission is implemented.
