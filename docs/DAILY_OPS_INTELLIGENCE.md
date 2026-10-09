# ReDom Daily Operations Intelligence

## Runtime configuration

The worker starts with the backend, checks its persistent report schedule every minute, and runs a separate critical-operations watcher every five minutes. Report claims use PostgreSQL advisory locking, a unique daily report key, stale-run recovery, and capped exponential retry backoff. The alert watcher sends a separate email for recently observed high/critical incidents or a burst of at least three recent email failures; alert delivery still depends on Resend availability.

| Variable | Purpose | Default |
|---|---|---|
| `REDOM_OPS_REPORT_RECIPIENT` | Single administrative report recipient | `christianuzamaosahuo@gmail.com` |
| `REDOM_OPS_REPORT_FROM` | Verified Resend sender identity | `admin@wnncompany.com` |
| `REDOM_OPS_REPORT_TIMEZONE` | Reporting timezone displayed in reports | `UTC` |
| `REDOM_OPS_GEMINI_MODEL` | Gemini model used for structured analysis | `gemini-2.5-flash` |
| `REDOM_OPS_ADMIN_KEY` | High-entropy secret required by private dashboard and report APIs | Not configured; APIs return 503 |
| `REDOM_OPS_REPORT_SIGNING_KEY` | Secret used to HMAC-sign canonical report metrics/analysis | Not configured; reports are marked UNSIGNED |
| `REDOM_EMAIL_DAILY_LIMIT` | Verified/configured internal daily limit, if applicable | Unknown |
| `REDOM_EMAIL_MONTHLY_LIMIT` | Verified/configured internal monthly limit, if applicable | Unknown |
| `RESEND_WEBHOOK_SECRET` | Secret used to verify signed Resend delivery webhooks | Optional in existing environment configuration |

Do not set an internal limit to imitate a provider quota. Configure the actual limits only after confirming them in the provider dashboard or official account configuration. Store all secrets in Render/Replit environment configuration, never in Git.

## Endpoints

- `POST /ops/email/webhook` — signed Resend event ingestion. Configure the matching webhook URL in Resend. Also available beneath the backend's `/redom-backend` mount.
- `GET /ops/admin` — read-only administrative website for report history, metrics, PDF downloads and signature verification. Enter the key into the page; it is held in memory only and never placed in the URL or local storage.
- `GET /ops/reports` — list report run metadata; requires `x-redom-ops-key: <REDOM_OPS_ADMIN_KEY>`. 
- `GET /ops/reports/:reportKey` — inspect archived metrics and AI analysis; requires the same key.
- `GET /ops/reports/:reportKey.pdf` — download an archived PDF; requires the same key.
- `GET /ops/reports/:reportKey/verify` — verify PDF checksum and HMAC signature; requires the same key.

The archive endpoints intentionally return 503 until `REDOM_OPS_ADMIN_KEY` is configured. Keep this key server-side and do not embed it in client applications. Set `REDOM_OPS_REPORT_SIGNING_KEY` to a separate high-entropy secret to enable the unique HMAC-SHA256 stamp. Configure a stable key from your secrets manager; rotating it without retaining a verifier for prior key versions makes older signatures unverifiable. Without it, the report must say UNSIGNED; the system never fabricates an official signature. Admin reads, downloads, verification attempts and failed authentication are recorded in the audit table. The dashboard is strictly read-only for ReDom business/production state: it has no case, account, payment, quota, configuration, suspension, or remediation mutation actions. Its only writes are to the dedicated operations-report ledger and security audit trail. The PDF includes a unique HMAC-SHA256 report signature, payload hash, report ID, key ID, and a visible status-colored system stamp; the signature is not a handwritten officer signature and must be verified using the protected verification endpoint.

## Data coverage and limitations

The email ledger begins recording when each send path is instrumented and signed provider webhooks are configured. The first report must not be interpreted as a complete historical email count. Current instrumentation covers support responses, refund notifications, authentication OTPs, registration confirmation/invalidation, login notifications, payment notifications, bug reports, and operations reports/alerts. Other direct Resend senders must be instrumented before platform-wide send-attempt totals are complete. Provider webhooks contribute accepted/delivered/failure events, with idempotent webhook ingestion.

Support message counts are not email counts. Case-linked email-consumption metrics only include email events attributed to cases. Delivery status remains "accepted" until a signed provider delivery event confirms delivery; provider acceptance alone is not inbox delivery.

Application logs, Sentry issue feeds, deployment events, latency, and infrastructure resource metrics are not yet connected to a queryable reporting API. Unhandled Express API exceptions are also persisted as high-severity incidents, then surfaced by the five-minute alert watcher. The incident register therefore still does not capture every handled error or constitute a complete platform-wide incident feed. The report explicitly states this rather than claiming those systems are healthy. Monthly delivery rate is delivered events divided by known terminal outcomes (delivered + failed + bounced + rejected), grouped by event timestamp; outcome coverage is shown separately so an incomplete webhook ledger cannot be mistaken for a high success rate. The month-by-month email report uses the exact rolling 365-day window, with partial first/current month buckets and pre-window events excluded; each month shows unique logical emails, total send attempts/retries, delivered events, terminal failures, delivery rate, and outcome coverage. The PDF carries a unique report ID, signed payload hash, key ID, HMAC signature fingerprint and a visible system stamp colored by report signature and platform status. It is an event-period measure, not a fully reconciled send-cohort metric. A deterministic report-only guardrail marks the executive status critical for open critical incidents or at least 10 failures/bounces/rejections in 24 hours, and degraded for tracked high incidents, a burst of at least three failures, or delivery below 90% across at least five terminal outcomes. The report includes exact rolling 365-day start/end timestamps and a 12-calendar-month trend. Support analytics include case numbers created/active/resolved/invalidated, closure metrics, repeated-contact senders for the previous complete calendar month, common categories/subjects, and aggregate registration geography where available. Open security/payment/service-continuity cases matching conservative keyword/category rules are shown as high-priority review candidates, not assigned a fabricated official severity. Failed inbound support-email processing and failed refund outcomes are counted separately from support cases. The exact rolling-365-day monthly email query filters events by the rolling start/end timestamps even when the first calendar-month bucket is partial. The schema has no independent expiration or recycling state, so invalidation is not falsely labeled expiration/recycling. It also has no support-case priority/severity field and its status constraint has no failed state; critical counts refer to the operations incident register, with incident keys listed for open critical incidents. Email failures and failed tracked incidents are reported separately. The report does not invent critical/failed case classifications. Potential fraud indicators are conservative keyword-based review leads; addresses and supporting case numbers appear only in the authenticated administrator report and are never sent to Gemini. Current 30-day distinct flagged senders are compared with the preceding 30 days and the report lists a recommended manual review step per signal. Keyword matches are not findings of fraud. No automated suspension, account block, refund denial, or other enforcement is performed. The forecast is a low-confidence weighted estimate until adequate historical data has accumulated.

## Operational verification checklist

1. Set and verify `REDOM_OPS_REPORT_FROM` in Resend. The code's default sender will fail if the identity/domain is not verified.
2. Configure the Resend webhook for `POST /ops/email/webhook` and set `RESEND_WEBHOOK_SECRET`.
3. Set `REDOM_OPS_ADMIN_KEY` and `REDOM_OPS_REPORT_SIGNING_KEY` to separate high-entropy secrets in the deployment environment.
4. Set internal quota variables only if those are actual enforced ReDom limits.
5. Run `pnpm --filter @workspace/redom-backend run typecheck` and `pnpm --filter @workspace/redom-backend run build`.
6. Verify the worker creates one report run, submits a PDF attachment, records provider acceptance, and later reconciles delivered/bounced events.
7. Verify the five-minute alert watcher sends and deduplicates high/critical incident alerts and email-failure-burst alerts.\n8. Verify a restart and a second backend instance do not create duplicate daily reports.
8. Verify the PDF opens in a standard PDF reader and all data coverage limitations are visible.
9. Confirm production deployment and actual inbox delivery before calling the system live.
