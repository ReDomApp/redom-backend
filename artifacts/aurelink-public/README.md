# Aurelink Public Customer Experience

The existing authentication page remains unchanged in `public/index.html`. The communications workspace is available directly at `/portal.html`. If a visitor is not authenticated, the portal sends them to the existing login page with `next=/portal.html`. The root login only redirects when an explicit `next` parameter is present; its default post-login behavior is intentionally unchanged.

## Customer portal

- `public/portal.html` — authenticated customer workspace entry point.
- `public/portal.js` — authenticated API client, navigation, screens and actions.
- `public/portal.css` — responsive Aurelink-owned visual system, loading states and feedback.

The portal reuses the existing Aurelink access token in same-origin session storage and calls the customer-facing backend routes. It does not fake provider status or invent DNS records. Long-running requests use Aurelink-branded loading overlays; forms show backend success and error results.

## Product workspaces

- Overview — unified SMS, Email, delivery, provider and consumption summary.
- SMS — channel overview, send workspace, campaigns, Sender ID applications and activity.
- Mail — channel overview, send workspace, templates, contacts, domains, DNS, sender identities, SMTP credentials, tracking and reputation.
- Verification — Aurelink-generated SMS and email OTP sessions.
- Developer — projects, API keys, request logs, webhooks, deliveries, Node.js and Java SDK references.
- Billing — separate number wallet, SMS package credits and Mail subscriptions/credits, plus purchase-reference verification.
- Workspace — team access, account verification and session/login activity.

## Preserved product boundaries

- The existing Phone Numbers purchase/activation dashboard, SMSPool and NonVoip integrations, number renewals, incoming-message flow and internal settings are not rebuilt or modified here. The portal keeps Phone Numbers separate and links to the existing `aurelink-new` service at `https://aurelink-new.onrender.com` without modifying its number-purchase screens.
- The private Aurelink Admin remains a separate operations tool and is not exposed in the customer portal.
- SMS and Email provider routing remains server-controlled where the public send API does not accept customer provider selection.
- Customer SMTP uses Resend-native settings: `smtp.resend.com`, port 465 SSL/TLS or port 587 STARTTLS, username `resend`, and a domain-scoped sending-only key. The standalone Aurelink SMTP gateway is prepared infrastructure, not a live customer endpoint.
- Aurelink-hosted inbound mailboxes, inbound SMTP, IMAP and POP3 are not included. ReDom Mail is a separate infrastructure service.
- Sender ID Aurelink security review is distinct from provider submission and provider approval.
- Mail credits, SMS package credits and the existing number wallet remain separate.
- Features without customer-facing backend routes are not represented as working controls. Current backend gaps include campaign editing/pause controls, webhook URL/event editing, customer payment-history/receipt listing, and a direct Phone Numbers workspace link.

## Private operations console

- `public/operations.html`, `public/operations.js`, and `public/operations.css` provide a separate communications operations workspace for manual message review, SMTP reconciliation, Sender ID provider submissions, payment investigation, pricing, credit adjustments, country verification and private evidence retrieval.
- The operations page reuses the authenticated Aurelink session but every administrative action is independently authorized by the backend administrator allowlists. It is not linked from the customer navigation and does not replace or modify `artifacts/aurelink-admin`.
- The current backend does not expose an administrator list endpoint for all pending Aurelink Sender ID security-review applications. The console reports this limitation rather than presenting an incomplete queue as complete.

## Deployment

Serve the contents of this directory's `public/` folder as the static site root, preserving the existing public login route. Configure the `aurelink-api-base` meta tag in `portal.html` if the backend API origin or mount path changes.

The portal is a static browser application and requires no additional build step.
