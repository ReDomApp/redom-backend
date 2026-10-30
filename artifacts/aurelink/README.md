# AURELINK — SMSPool Short-term and number-provider integration

AURELINK is mounted into the existing ReDom backend. Short-term inventory is served exclusively by SMSPool. NonVoip remains limited to its existing long-term and dedicated number features. The executable TypeScript lives under `artifacts/redom-backend/src/services/aurelink` and `artifacts/redom-backend/src/routes`.

## Providers

### SMSPool — Short-term numbers

- Base URL: `https://api.smspool.net`
- API key: `SMSPOOL_API_KEY`, server-side only
- API reference: https://api.smspool.net/docs
- SMSPool API overview: https://www.smspool.net/article/how-to-use-the-smspool-api
- Activation flow reference: https://www.smspool.net/article/smspool-api-order-view-and-cancel-numbers-9883b6969fad
- Official SDK endpoints checked against https://github.com/smspool/smspool-js

## Implemented backend routes

All routes require a valid ReDom access token unless noted otherwise. They are served by the general backend at both `/aurelink/*` and `/redom-backend/aurelink/*`.

### Catalog and status

- `GET /aurelink/status`
- `GET /aurelink/provider/balance` — administrator-only
- `GET /aurelink/catalog/services`
- `GET /aurelink/catalog/countries`
- `GET /aurelink/catalog/pools`
- `GET /aurelink/catalog/pricing?country=<SMSPool-country-ID>&service=1`
- `GET /aurelink/catalog/stock?country=<SMSPool-country-ID>&service=1`
- `GET /aurelink/catalog/suggested-countries?service=1`
- `GET /aurelink/catalog/success-rate?service=1&country=US`
- `GET /aurelink/catalog/valid-pools?service=1&country=US`
- `GET /aurelink/catalog/rentals?extendable=1`
- `GET /aurelink/catalog/rentals/:rentalId/pricing?service=1`

### One-time SMS activation

- `POST /aurelink/quotes` — fetches live SMSPool pricing from Mike Pool 2, applies the server-side Short-term pricing rule and stores a 10-minute, single-use quote. Request: `{ "kind":"activation", "country":"US", "service":"1" }`.
- `POST /aurelink/checkout` — creates a hosted Stripe Checkout session for a valid AURELINK quote and stores a purpose-specific payment transaction.
- `POST /aurelink/activations` — consumes a quote after verifying a paid `payment_transactions` row for the same user, purpose `aurelink_otp`, USD, and sufficient amount. Request: `{ "quoteId":"<uuid>", "paymentReference":"<paid-reference>" }`.
- `GET /aurelink/activations/:orderId/messages` — SMSPool message polling for the owner; persists first-SMS-arrival time and expiry.
- `POST /aurelink/activations/:orderId/resend` — administrator-only until resend fees are billed
- `POST /aurelink/activations/:orderId/cancel` — SMSPool cancellation and wallet refund after provider confirmation
- `GET /aurelink/orders` — user's own recorded orders.

SMSPool uses polling rather than an SMS push webhook for temporary activations. Client apps should poll the AURELINK messages route with a modest interval and stop when the order completes, expires, or is refunded.

### Long-term rentals

- `POST /aurelink/rental-quotes` — obtains live rental pricing for a rental ID and duration.
- `POST /aurelink/checkout` — also creates checkout for rental quotes using purpose `aurelink_rental`.
- `POST /aurelink/rentals` — consumes the paid rental quote and purchases the rental.
- `GET /aurelink/rentals/:rentalId/messages` — persists SMS-arrival time and provider expiry.
- `GET /aurelink/rentals/:rentalId/status` — refreshes provider status and expiry.
- `POST /aurelink/rentals/:rentalId/renew` — request body: `{ "days": 30, "paymentReference": "<paid-reference>" }`; SMSPool exposes the extension duration in days and each renewal is payment-gated.
- `POST /aurelink/rentals/:rentalId/cancel` — administrator-only until customer refunds are integrated

### Other SMSPool capabilities

- `POST /aurelink/carrier-lookup` — currently administrator-only to prevent unmetered provider-balance spend until customer billing is added.
- `GET /aurelink/esim/plans?country=US`
- `GET /aurelink/esim/pricing`
- `GET /aurelink/esim/profile?transactionId=...`
- `GET /aurelink/esim/topup-plans?transactionId=...`
- eSIM purchasing/top-ups and some account-changing eSIM actions are intentionally not enabled until the customer-payment and provider-cost reconciliation path is completed. SMSPool eSIMs are data-only; they do not supply a phone number.
- Voice/flash activation types are represented in the provider client, but should only be exposed in UI where SMSPool reports the selected country/pool supports them.

## Aurelink wallet and number billing

- `GET /aurelink/wallet` returns the authenticated user's USD balance.
- `GET /aurelink/wallet/ledger?limit=30` returns wallet credits and debits.
- `POST /aurelink/wallet/topup` accepts `{ "amountUsd": 10 }` and returns a Stripe Checkout URL. Supported top-ups are $5–$5,000 USD.
- `POST /aurelink/activations` accepts `{ "quoteId": "<uuid>" }` and debits the Aurelink wallet atomically before ordering. The legacy paid-transaction redemption path remains available when a `paymentReference` is supplied.
- Provider-confirmed customer activation cancellations credit the wallet ledger. Expiry reconciliation is handled by the lifecycle worker and only credits wallet-funded orders after the provider confirms cancellation/refund.
- First successful-OTP eligibility is account-scoped: a purchase does not consume the first-time offer until an OTP has arrived. A $1.00 provider price quotes at $1.50 for the first eligible purchase; subsequent short-term purchases use 2× provider price plus the agreed $0.20 check fee (a $2.20 standard total).
- Number line checks now use the Veriphone v3 static verification API and accept only valid `mobile` classifications. A missing or failed lookup fails closed.

## Configuration

Add these to the deployment environment, never to source control:

- `NONVOIP_API_KEY`
- `SMSPOOL_API_KEY`
- `VERIPHONE_API_KEY` — required for purchased-number line-type checks
- `AURELINK_ALLOWED_SERVICES` — comma-separated SMSPool service names/IDs approved for sale. Empty means customer purchases are disabled.
- `SMSPOOL_WHATSAPP_APPROVED=false` — keep false until SMSPool explicitly approves AURELINK's customer-facing WhatsApp resale/API use.
- `AURELINK_SHORT_TERM_CHECK_FEE_USD_CENTS=20`
- `AURELINK_LONG_TERM_CHECK_FEE_USD_CENTS=100`
- `AURELINK_DEDICATED_CHECK_FEE_USD_CENTS=100`
- `AURELINK_ADMIN_USER_IDS` — comma-separated ReDom user IDs allowed to inspect provider balance and use unmetered carrier lookup.
- `AURELINK_SMSPOOL_TIMEOUT_MS=12000`

Standard AURELINK customer totals are calculated server-side as the live provider amount plus an equal Aurelink charge plus the applicable product-specific check fee. Short-term, long-term, and dedicated numbers have separate fee settings. The Short-term check fee defaults to $0.20; long-term and dedicated retain independent $1.00 defaults. The first-time Short-term offer preserves the agreed $1.00 provider → $1.50 customer example. A zero or invalid provider amount is unavailable and cannot be quoted or purchased. The branch creates hosted Stripe Checkout sessions in USD for activation and rental quotes. The payment callback verifies Stripe’s session amount and currency against the recorded transaction before marking it paid. AURELINK then checks that paid transaction before ordering from SMSPool. Never trust a client-provided price.

## Safety, pricing and provider restrictions

- The API key is only sent from the server to SMSPool in form-encoded POST bodies. The country catalog filters labels containing `Virtual`/`VoIP`, and order/quote endpoints fail closed unless the selected country can be matched to the provider catalog as non-VoIP. The frontend should use the provider country ID returned by the filtered catalog. After an activation or rental is purchased, AURELINK performs a per-number SMSPool carrier lookup before accepting it. Explicit VoIP results are rejected and cancellation is requested; lookup failures or results that do not establish a mobile line also fail closed. Only verified mobile results are returned as accepted purchases. Carrier, line type, verification time, SMS-arrival time, expiry, and last provider-check time are persisted. After an activation or rental is purchased, AURELINK performs a per-number SMSPool carrier lookup before accepting it. Explicit VoIP results are rejected and cancellation is requested; lookup failures or results that do not establish a mobile line also fail closed. Only verified mobile results are returned as accepted purchases. Carrier, line type, verification time, SMS-arrival time, expiry, and last provider-check time are persisted.
- Every order is associated with the authenticated user in PostgreSQL; reads, cancellation, resend and rental management enforce ownership.
- Purchase endpoints require a paid transaction and a live price guard. Provider orders are not placed when a matching paid transaction cannot be found.
- Services must be explicitly allowlisted. Banking, crypto exchange, government and telecom verification are denied by the service filter. WhatsApp remains disabled unless `SMSPOOL_WHATSAPP_APPROVED=true`.
- SMSPool may require separate service whitelist approval. A generic API key does not mean every service is approved.
- SMSPool's API does not make all destination platforms accept a number. Never advertise guaranteed acceptance by WhatsApp, Facebook, TikTok, or other third parties.
- A provider price or availability response is not a reservation. Prices and stock can change between quote and order; the maximum-price guard prevents an activation order above the quoted provider cost.
- Do not expose raw provider payloads or full SMS bodies in application logs. SMSPool cancellation/refund actions affect AURELINK’s provider balance; they do not automatically refund a customer’s original payment. Wire the customer refund/credit path before exposing cancellation to production customers. SMSPool supports inbound SMS retrieval, not sending outbound SMS from rented numbers.

## Database

Startup creates `aurelink_quotes` and `aurelink_provider_orders` with indexes and performs additive migrations for lifecycle fields. Quotes expire after ten minutes and are single-use. Provider orders are scoped to the owner. A provider-aware background lifecycle worker starts with the backend when `SMSPOOL_API_KEY` is present; by default it checks up to 25 pending activations/rentals each minute, records first SMS receipt and provider status/expiry, and marks expired pending activations. Configure `AURELINK_LIFECYCLE_POLL_MS` (minimum 30 seconds) and `AURELINK_LIFECYCLE_BATCH_SIZE` (1–100) if needed.

## Validation status

This branch was authored against the existing Express 5 / TypeScript backend and SMSPool's published API reference/official JavaScript SDK. Carrier lookup is a paid provider capability; confirm the current SMSPool lookup price and account permissions before enabling customer sales. This branch still requires a repository CI/typecheck run and a live SMSPool low-risk test using AURELINK's own account before production enablement. The carrier-response parser must be confirmed against real SMSPool responses before relying on it as a compliance guarantee. Do not turn on customer purchasing until the payment-creation flow is wired to the quoted amount and the provider confirms commercial resale rights.
