# Aurelink Public Customer Experience

The public site preserves the existing Aurelink authentication screens in `public/index.html`. After a successful email/password sign-in, customers are routed to `public/portal.html`.

## Customer portal

- `public/portal.html` — customer workspace entry point.
- `public/portal.js` — authenticated API client, navigation, screens and actions.
- `public/portal.css` — responsive Aurelink-owned visual system and loading states.

The portal uses the existing Aurelink access token in same-origin session storage and the authenticated endpoints introduced by the communications platform backend. It does not fake provider status or invent DNS records.

## Deployment

Serve the contents of this directory's `public/` folder as the static site root, preserving the existing public login route. Configure the `aurelink-api-base` meta tag in `portal.html` if the backend API origin or mount path changes.

The portal is a static browser application; no additional build step is required. The existing number-purchase and private admin experiences are not modified by this customer portal change.

## Product boundaries

- SMS/Email provider routing remains server-controlled where the API does not accept customer provider selection.
- Customer SMTP uses Resend-native settings (`smtp.resend.com`, 465 SSL/TLS or 587 STARTTLS) until the Aurelink-owned gateway is deployed and verified.
- Sender ID Aurelink security review is distinct from Brevo provider approval and operator submission.
- Mail credits, SMS package credits and the existing number wallet remain separate.
- Features without customer-facing backend routes are not represented as working controls.
