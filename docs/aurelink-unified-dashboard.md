# Aurelink unified customer dashboard

This frontend is a customer-facing workspace layered over the communications APIs introduced by PR #64. It is intentionally a static HTML/CSS/JavaScript application under `artifacts/aurelink-public/public`, matching the existing public login deployment shape.

## Entry and authentication

- Existing public login, registration, email verification and password recovery remain in `index.html`.
- Successful login continues to honor an explicit `next` destination; otherwise it routes to `/app.html`.
- The dashboard reads the existing `aurelink.accessToken` and `aurelink.user` session-storage values and sends the access token as a Bearer token.
- The dashboard does not persist provider credentials or API secrets in browser storage.
- Session expiry returns the user to the existing login page.

## Customer workspaces

- Overview: 30-day message totals, channel totals, accepted/delivered/failed/pending/queued counts, provider readiness, usage, recent activity.
- SMS: destination registry, send form, message history/search/retry, contacts and consent, campaigns, sender registration, analytics, credit balance/catalogue/ledger.
- Email: send form, saved templates and variables, attachments, activity, contacts and consent, campaigns, sending domains, provider DNS records, Cloudflare connections, sender identities, SMTP credentials, tracking.
- Verification: SMS and email OTP start/check.
- Developer: API usage/key metadata, request logs, webhook endpoint CRUD, event selection, test events, delivery history/retry, signing-secret rotation.
- Billing: separate SMS credit view and Mail subscriptions/prepaid credits/billing mode/fallback/cancellation.

## Preserved products and boundaries

- This change does not alter SMSPool short-term number purchasing, NonVoip long-term/dedicated number services, number renewals, the number wallet, or internal number-provider settings.
- The Phone Numbers navigation item is informational only; the existing number-purchase implementation is not replaced.
- SMS API credits, Mail credits and the number wallet are presented as separate financial systems.
- Customer SMTP uses Resend-native credentials and `smtp.resend.com` (465 SSL/TLS or 587 STARTTLS). The prepared `infra/aurelink-smtp-gateway` is not represented as deployed customer infrastructure.
- Inbound mailboxes, inbound SMTP, IMAP and POP3 are not represented as Aurelink Mail features.
- Sender ID approval by Aurelink is distinct from provider approval. Brevo submission remains an authorized operator workflow after the one-hour hold.
- The customer app does not expose the private operations console.

## Current backend gaps deliberately not simulated

- SMS package billing exposes catalogue, balance and ledger routes, but no customer checkout/verification route is exposed by the current communications routes.
- Customer API-key/project create, rotate and revoke routes are not exposed by the public developer API; the UI shows existing key usage metadata only.
- Reputation metrics/alerts do not have a customer-facing read endpoint in this PR. Tracking configuration is available.
- Campaign edit/pause/resume controls are not exposed as customer routes. Campaign creation and queueing are implemented.
- CC/BCC are described in some API documentation but are not accepted by the current email send route; they are not offered as working fields.
- Provider choice for SMS and email sends is controlled by backend default-provider configuration, not by per-message customer selection.

## Manual smoke test

1. Sign in using an existing Aurelink account; confirm redirect to `/app.html`.
2. Check the overview, channel-specific dashboards and recent activity.
3. Send a transactional SMS using a provider-approved sender and a supported destination; verify the message appears in activity with provider acceptance and later delivery state.
4. Send an email from a verified sender domain, including a template and a small attachment; verify activity and provider callbacks.
5. Create and update an email template; create SMS/email contacts with explicit consent states; create a draft campaign and queue it.
6. Register a business website, publish the returned TXT challenge, verify it, upload evidence and submit a Sender ID application.
7. Add a sending domain, inspect provider-issued DNS records, connect Cloudflare with a zone-scoped token, and apply records without overwriting existing SPF.
8. Issue, rotate and revoke a Resend-native SMTP credential; verify the password is shown once.
9. Start and check SMS/email OTP sessions; verify expiration and attempt limits server-side.
10. Configure a developer webhook, send a test event, inspect delivery attempts and retry a failed delivery.
11. Test responsive navigation at desktop, tablet and mobile widths.
