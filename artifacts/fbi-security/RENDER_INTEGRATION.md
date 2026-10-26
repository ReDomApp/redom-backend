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
## Scheduled processing and email — DISABLED

The FBI Security feature is intentionally retained in this repository but is nonfunctional by design. The worker's enable check is hardcoded off, the report and immediate-alert email paths have a hard stop, and the FBI Security API routes are unmounted. Setting environment variables cannot reactivate it. No polling, AI research, report generation, or email sending should occur. Do not configure or enable FBI Security worker variables. Re-enabling requires an explicit code change and review.
