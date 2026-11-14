# Aurelink Public Login

Standalone public-facing Aurelink login experience, kept separate from `artifacts/aurelink-admin`.

Static entry point: `public/index.html`.

Authentication is not faked: email/password, password recovery, registration and OAuth actions display an explicit notice until connected to the approved Aurelink authentication API and configured provider credentials.

## Customer workspace dashboard

The authenticated customer workspace is served from `public/dashboard.html`. After a successful Aurelink email/password login, the public login page redirects to this dashboard. It uses the existing session access token and calls the backend under `/aurelink/*`; it does not create a second authentication system.

### Current dashboard routes

- Overview: communications overview, provider configuration flags, usage summary and recent message activity.
- Phone Numbers: read-only number wallet and order history. Existing SMSPool short-term, NonVoip long-term/dedicated purchase, renewal and settings flows are deliberately not rewritten by this dashboard.
- SMS: send workspace and SMS message history/retry using the communications API.
- Email: send workspace, email activity and reusable email templates.
- Contacts: combines the channel-specific SMS and Email contact endpoints; consent status and source remain visible.
- Campaigns: draft and start SMS/Email campaigns through the existing campaign routes.
- OTP: start and verify an Aurelink-generated OTP session; the provider is treated only as a delivery adapter.
- Domains and senders: add provider-backed sending domains, inspect/check/verify DNS status, connect Cloudflare and manage email sender identities.
- SMTP: issue/list/revoke customer SMTP credentials and display the Resend-native customer connection settings. Full credentials are shown only on issuance.
- Reputation: view available reputation metrics and acknowledge alerts.
- Sender IDs: view the application list and expose the application area. Full evidence upload and complete business application wizard remain a follow-up UI task; the backend correctly rejects incomplete submissions.
- Developer: API request overview and logs. API key issuance is not exposed by the customer routes currently present in this branch and is not fabricated in the UI.
- Webhooks: create endpoints, display the one-time signing secret, test, rotate and delete endpoints.
- Billing: communications usage and the active Mail plan/credit-pack catalogue. Payment checkout and billing-mode mutation are not yet exposed as complete customer workflows in this dashboard.
- Team: list members and issue invitations with one-time invitation tokens.

### Integration and security notes

- API calls use the authenticated Aurelink access token from the existing sign-in flow. No provider API keys are sent to the browser.
- The dashboard uses the backend workspace ID returned by the API and sends it as `X-Aurelink-Workspace-Id` after it is established.
- SMS/email send calls generate a unique `Idempotency-Key` per submission.
- No sample messages, balances, provider states or delivery outcomes are substituted when an API request fails.
- SMS and email provider selection is resolved by the existing server-side workspace configuration for send routes; the UI does not offer a misleading provider selector where the route ignores it.
- Resend-native SMTP remains the active customer-facing configuration: `smtp.resend.com`, port 465 SSL/TLS or 587 STARTTLS, username `resend`, and an Aurelink-issued domain-scoped key. The standalone Aurelink SMTP gateway remains prepared infrastructure only.
- The dashboard is a first responsive customer-workspace implementation. The full Sender ID evidence wizard, SMTP tracking configuration, all DNS actions, full billing checkout/mode controls, and API-key lifecycle UI require additional route-specific forms and should not be considered complete solely because backend endpoints exist.
