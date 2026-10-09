# ReDom Daily Operations Intelligence

## Runtime configuration

The worker starts with the backend, checks its persistent report schedule every minute, and runs a separate critical-operations watcher every five minutes. Report claims use PostgreSQL advisory locking, a unique daily report key, stale-run recovery, and capped exponential retry backoff. The alert watcher sends a separate email for recently observed high/critical incidents or a burst of at least three recent email failures; alert delivery still depends on Resend availability.

| Variable | Purpose | Default |
|---|---|---|
| `REDOM_OPS_REPORT_RECIPIENT` | Single administrative report recipient | `christianuzamaosahuo@gmail.com` |
| `REDOM_OPS_REPORT_FROM` | Verified Resend sender identity | `admin@wnncompany.com` |
| `REDOM_OPS_REPORT_TIMEZONE` | Reporting timezone displayed in reports | `UTC` |
| `REDOM_OPS_GEMINI_MODEL` | Gemini model used for structured analysis | `gemini-2.5-flash` |
| `REDOM_OPS_ADMIN_KEY` | Secret required by the private report archive API | Not configured; archive API returns 503 |
| `REDOM_EMAIL_DAILY_LIMIT` | Verified/configured internal daily limit, if applicable | Unknown |
| `REDOM_EMAIL_MONTHLY_LIMIT` | Verified/configured internal monthly limit, if applicable | Unknown |
| `RESEND_WEBHOOK_SECRET` | Secret used to verify signed Resend delivery webhooks | Optional in existing environment configuration |

Do not set an internal limit to imitate a provider quota. Configure the actual limits only after confirming them in the provider dashboard or official account configuration. Store all secrets in Render/Replit environment configuration, never in Git.

## Endpoints

- `POST /ops/email/webhook` — signed Resend event ingestion. Configure the matching webhook URL in Resend. Also available beneath the backend's `/redom-backend` mount.
- `GET /ops/reports` — list report run metadata; requires `x-redom-ops-key: <REDOM_OPS_ADMIN_KEY>`.
- `GET /ops/reports/:reportKey.pdf` — download an archived PDF; requires the same key.

The archive endpoints intentionally return 503 until `REDOM_OPS_ADMIN_KEY` is configured. Keep this key server-side and do not embed it in client applications.

## Data coverage and limitations

The email ledger begins recording when each send path is instrumented and signed provider webhooks are configured. The first report must not be interpreted as a complete historical email count. Current instrumentation covers support responses, refund notifications, authentication OTPs, registration confirmation/invalidation, login notifications, payment notifications, bug reports, and operations reports/alerts. Other direct Resend senders must be instrumented before platform-wide send-attempt totals are complete. Provider webhooks contribute accepted/delivered/failure events, with idempotent webhook ingestion.

Support message counts are not email counts. Case-linked email-consumption metrics only include email events attributed to cases. Delivery status remains "accepted" until a signed provider delivery event confirms delivery; provider acceptance alone is not inbox delivery.

Application logs, Sentry issue feeds, deployment events, latency, and infrastructure resource metrics are not yet connected to a queryable reporting API. The incident register therefore only knows about failures explicitly recorded by the current backend integrations; it must not be interpreted as a complete platform-wide incident feed. The report explicitly states this rather than claiming those systems are healthy. The forecast is a low-confidence weighted estimate until adequate historical data has accumulated.

## Operational verification checklist

1. Set and verify `REDOM_OPS_REPORT_FROM` in Resend. The code's default sender will fail if the identity/domain is not verified.
2. Configure the Resend webhook for `POST /ops/email/webhook` and set `RESEND_WEBHOOK_SECRET`.
3. Set `REDOM_OPS_ADMIN_KEY` to a high-entropy secret in the deployment environment.
4. Set internal quota variables only if those are actual enforced ReDom limits.
5. Run `pnpm --filter @workspace/redom-backend run typecheck` and `pnpm --filter @workspace/redom-backend run build`.
6. Verify the worker creates one report run, submits a PDF attachment, records provider acceptance, and later reconciles delivered/bounced events.
7. Verify the five-minute alert watcher sends and deduplicates high/critical incident alerts and email-failure-burst alerts.\n8. Verify a restart and a second backend instance do not create duplicate daily reports.
8. Verify the PDF opens in a standard PDF reader and all data coverage limitations are visible.
9. Confirm production deployment and actual inbox delivery before calling the system live.
