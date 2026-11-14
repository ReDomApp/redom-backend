# Aurelink customer workspace

This folder adds a responsive customer-facing communications workspace to the existing Aurelink public static application.

## Entry point and deployment

- Static entry: `public/index.html` (existing login and registration experience).
- Authenticated workspace: `public/dashboard.html`.
- Styles: `public/dashboard.css`.
- Application logic: `public/dashboard.js`.
- Keep the current Aurelink public Render static-site root at `artifacts/aurelink-public`; the workspace is served from the same public root and uses the existing API base metadata.
- Successful email/password sign-in redirects to `/dashboard.html`. Existing registration, verification and password-recovery flows remain in the original entry page.
- The dashboard reuses the existing sessionStorage keys: `aurelink.accessToken`, `aurelink.refreshToken`, and `aurelink.user`.

## Implemented customer views

- Unified communications overview with SMS/email totals, accepted/delivered/failed/queued/pending breakdowns, usage, domain/contact/campaign counts and recent message activity.
- SMS send form using the server-configured provider, country registry, approved sender enforcement, E.164 validation, marketing consent enforcement and idempotency.
- Email send form using verified sender identities and server-configured provider routing.
- Searchable SMS/email message activity, detail inspection and eligible retry action.
- SMS/email templates: list, create, edit and delete.
- SMS/email contacts with opt-in, opt-out and unknown consent states.
- SMS/email campaign draft creation and launch through the backend's recipient eligibility/consent checks.
- Sending-domain onboarding, provider-issued DNS record display, DNS check/verification, optional Cloudflare connection and record application, suspend/resume and removal.
- Email sender identity creation and provider status refresh.
- Resend-native SMTP credential issuance, one-time password display, metadata, rotation and revocation.
- SMS website ownership challenge and status tracking; existing sender applications and registration states.
- OTP start and verification with Aurelink-generated codes.
- Developer overview, request logs and webhook endpoint lifecycle.
- Reputation scores/alerts and alert acknowledgement.
- Workspace members and invitation creation.
- Communications and Mail billing/usage views.
- Account profile and login history.

## API and product boundaries

- All requests use the existing authenticated Aurelink backend. No provider secrets are embedded in the browser.
- SMS and Email provider selection remains backend-configured because the current customer send endpoints do not accept a provider override. The UI does not pretend otherwise.
- Existing number purchasing, SMSPool temporary activations, NonVoip long-term/dedicated number flows, number wallet and internal settings are not modified by this frontend change.
- Customer SMTP remains Resend-native: `smtp.resend.com`, port 465 SSL/TLS or 587 STARTTLS, username `resend`, domain-scoped Resend sending key. The future Aurelink SMTP gateway is not represented as deployed.
- No inbound mailbox, inbound SMTP, IMAP or POP3 product is exposed.
- Sender ID applications are not submitted automatically to Brevo. The customer UI displays the Aurelink application lifecycle separately from provider approval.
- The current exposed customer developer routes include overview, usage/logs and webhooks. Project/API-key CRUD routes are not present in the inspected PR route set, so the UI does not invent them.
- The UI only offers operations backed by routes present in PR #64. Unsupported edit/pause/delete actions are not simulated.

## Verification still required

This is frontend code staged on a branch based on PR #64. Before deployment, run the existing backend and communications CI checks, validate the public static-site root on Render, and perform authenticated end-to-end browser tests against a staging deployment of the PR #64 backend. In particular test sign-in redirect, session expiry, domain/provider DNS responses, Cloudflare permissions, message acceptance/webhook correlation, sender approval, OTP expiry/attempt limits, billing responses, and SMTP credential one-time display/rotation/revocation.

No production DNS, Render service configuration, backend deployment, database migration, provider credential or customer account has been changed by this UI branch.
