# ReDom Daily Operations Intelligence

The backend scheduler creates a ReDom-branded executive email and PDF with 24-hour, previous-24-hour, and rolling-365-day operational metrics, support workload, case-linked email usage, tracked incidents, evidence-bound Gemini analysis, forecast notes, and telemetry coverage. It archives each report in Postgres and exposes the archive through an administrator-key-protected API.

## Required deployment configuration

Set these in the **redom-backend** service environment:

- `REDOM_OPS_ADMIN_KEY`: a long, unique secret used only to authorize the private report archive API. Send it as the `x-redom-ops-key` header.
- `REDOM_OPS_REPORT_RECIPIENT`: defaults to `christianuzamaosahuo@gmail.com`.
- `REDOM_OPS_REPORT_FROM`: defaults to `admin@wnncompany.com`. The sender/domain must be verified and permitted by Resend before delivery can succeed.
- `RESEND_WEBHOOK_SECRET` / existing `RESEND_WEBHOOK_SECRET` environment setting: configure the signing secret from the Resend webhook endpoint.
- `REDOM_OPS_GEMINI_MODEL`: optional; defaults to `gemini-2.5-flash`.
- `REDOM_EMAIL_DAILY_LIMIT` and `REDOM_EMAIL_MONTHLY_LIMIT`: optional verified/configured internal limits. They are not inferred from provider quota assumptions.
- `REDOM_OPS_REPORT_TIMEZONE`: optional IANA timezone label; reporting windows are rolling 24-hour windows and all timestamps are included in the report.

The backend already requires `DATABASE_URL`, `RESEND_API_KEY`, and `GEMINI_API_KEY` through its normal configuration. The operations tables are created idempotently during startup; the matching SQL migration is `artifacts/redom-backend/drizzle/0032_daily_ops_intelligence.sql`.

## Resend setup

Create a Resend webhook for the deployed backend endpoint:

- `POST https://redom-backend.onrender.com/ops/email/webhook`
- Subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.rejected`, `email.failed`, and `email.complained`.
- Copy the webhook signing secret into `RESEND_WEBHOOK_SECRET`.

The webhook is authenticated using Resend's Svix signature and timestamp; it intentionally does **not** require the separate admin key. The report archive endpoints do require `x-redom-ops-key`:

- `GET /ops/reports`
- `GET /ops/reports/:reportKey.pdf`

The router is mounted both at the root and under `/redom-backend`; if the public deployment uses the prefixed route, configure the webhook URL with that prefix instead.

## How reporting works

- The scheduler checks every minute but creates a report only when a 24-hour reporting interval is due. PostgreSQL locking and the unique report key prevent concurrent duplicate sends; retries use a capped exponential backoff.
- Gemini receives collected facts and must return structured analysis. If Gemini is unavailable or returns invalid output, the PDF still contains factual metrics and explicitly reports that AI analysis is unavailable.
- Provider acceptance is distinct from delivery. Resend webhook events update the stored delivery state.
- PDF bytes are archived with a SHA-256 checksum; report archive endpoints are not cacheable.
- The scheduler never has permission to change production data, deploy releases, or perform remediation. It can recommend actions only.

## Important data-coverage boundaries

Email totals represent events captured by instrumented send paths and signed Resend webhooks, not a retroactive provider-wide export. The report marks the ledger's earliest event and calls out partial coverage. Historical 365-day values become representative only after telemetry has been running or historical provider events are imported. A configured limit is shown only when explicitly set. No absent telemetry is represented as a healthy zero.

The current incident register captures failures that are explicitly recorded by the reporting service. It is not a substitute for connecting centralized application logs, Sentry, deployment status, or external infrastructure health sources; root-cause coverage remains limited until those data sources are wired in. Forecasts are low-confidence weighted estimates, not commitments.
