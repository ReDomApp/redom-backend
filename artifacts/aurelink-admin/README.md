# AURELINK Admin

Private operations frontend for AURELINK. The UI contains no payment flow and never stores the administrator password. Authentication is performed by the backend using a Render secret; the short-lived signed session token is held in sessionStorage.

## Render static site

- Branch: `artifacts/aurelink-admin`
- Build: `pnpm install --frozen-lockfile && pnpm --filter @workspace/aurelink-admin run build`
- Publish directory: `artifacts/aurelink-admin/dist`
- API base: `https://redom-backend.onrender.com/redom-backend`

## Backend environment

Configure these in the backend Render service before enabling login:

- `AURELINK_ADMIN_PASSWORD`: long, unique admin password (never commit it).
- `AURELINK_ADMIN_SESSION_SECRET`: random secret dedicated to signing admin sessions (recommended); otherwise the backend JWT secret is used.
- `SMSPOOL_API_KEY`: existing SMSPool API key.
- `AURELINK_ALLOWED_SERVICES`: server-side allowlist of enabled service IDs/names.

A stable admin identity UUID is created once in the database and is separate from normal user accounts. Admin order records use the `admin_account_id` extension on the existing AURELINK provider-order table, while customer orders remain tied to their normal user IDs.

## Receipt email

Transactional receipts should only be enabled when `RESEND_API_KEY` is present and the configured sender belongs to a verified Resend domain. Configure recipient and sender using Render environment variables; never expose the API key in the frontend. Receipt failures must not turn a successful provider purchase into a failed order.

## Safety

- Live SMSPool catalogs only; no mocked success states.
- Carrier lookup must positively classify the purchased number as mobile; VoIP or unknown types fail closed and trigger a cancellation request.
- A cancellation response is not a refund confirmation. Only show a refund as confirmed when the provider response explicitly confirms it.
- This private tool is not customer-facing and must not be given a public signup or payment workflow.
