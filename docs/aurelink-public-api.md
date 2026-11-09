# Aurelink Public API

The Aurelink API is an HTTPS API for applications that need to request phone numbers, receive verification messages, manage rentals and dedicated numbers, and inspect Aurelink wallet activity.

The API can be called directly with HTTP from any language. The official Node.js SDK is optional.

## Base URL and version

Production base URL:

\`\`\`
https://redom-backend.onrender.com/redom-backend/v1
\`\`\`

All routes below are relative to this base URL. The unprefixed alias \`https://redom-backend.onrender.com/v1\` is also available.

## Authentication

Send the API key in the Authorization header:

\`\`\`http
Authorization: Bearer aul_live_...
Accept: application/json
\`\`\`

Create separate test and live keys in the Aurelink Developer workspace. Test keys begin with \`aul_test_\`; live keys begin with \`aul_live_\`.

- Test keys use a sandbox. They do not contact number providers, create real numbers, or debit a wallet.
- Live keys call real Aurelink services and can create billable orders.
- API keys identify an application, not an end user.
- Never put a live key in browser code, mobile bundles, or public repositories.
- Secrets are shown once. Store them in a server-side secret manager.

## Permissions

| Scope | Access |
| --- | --- |
| \`catalog:read\` | Service, country and rental catalogues |
| \`orders:read\` | Order and activation status |
| \`numbers:write\` | Quotes, activations, rentals, cancellations and dedicated orders |
| \`messages:read\` | SMS messages received on Aurelink numbers |
| \`wallet:read\` | Wallet balance and ledger |

Keys can be limited to selected scopes, a per-minute request limit, and an optional expiry date. Account profile and security routes are never available to API keys.

## Rate limits and request IDs

Every authenticated API response includes:

- \`X-Aurelink-Request-Id\` — unique request identifier.
- \`X-Aurelink-Environment\` — \`test\` or \`live\`.
- \`X-Aurelink-RateLimit-Limit\` — configured per-minute limit.
- \`X-Aurelink-RateLimit-Remaining\` — remaining requests in the current minute.

A rate-limited request returns HTTP 429 with a \`Retry-After\` header. Request logs store method, route, status, latency, environment and request ID; authorization headers and request bodies are not logged.

## Idempotency for purchases

Live purchase requests must include a unique \`Idempotency-Key\` header. Use a UUID or another random value, and reuse that same value only when retrying the same intended purchase.

\`\`\`http
POST /redom-backend/v1/aurelink/activations
Authorization: Bearer aul_live_...
Idempotency-Key: 6f0e2e18-8c8b-4f66-8a5f-2b8e1c9b81ad
Content-Type: application/json
\`\`\`

A repeated key with the same request returns the stored response. Reusing a key with a different request body returns HTTP 409. An in-progress request returns HTTP 409. Idempotency records are retained for 24 hours.

## Catalog and number operations

| Method | Route | Permission |
| --- | --- | --- |
| GET | \`/aurelink/status\` | catalog:read |
| GET | \`/aurelink/catalog/services\` | catalog:read |
| GET | \`/aurelink/catalog/countries\` | catalog:read |
| GET | \`/aurelink/catalog/suggested-countries\` | catalog:read |
| GET | \`/aurelink/catalog/rentals\` | catalog:read |
| GET | \`/aurelink/nonvoip/countries\` | catalog:read |
| GET | \`/aurelink/nonvoip/products?country=US\` | catalog:read |
| GET | \`/aurelink/dedicated/countries\` | catalog:read |
| POST | \`/aurelink/quotes\` | numbers:write |
| POST | \`/aurelink/activations\` | numbers:write |
| GET | \`/aurelink/activations/:orderId/messages\` | messages:read |
| POST | \`/aurelink/activations/:orderId/resend\` | numbers:write |
| POST | \`/aurelink/activations/:orderId/cancel\` | numbers:write |
| POST | \`/aurelink/rental-quotes\` | numbers:write |
| POST | \`/aurelink/rentals\` | numbers:write |
| GET | \`/aurelink/rentals/:rentalId/status\` | orders:read |
| GET | \`/aurelink/rentals/:rentalId/messages\` | messages:read |
| POST | \`/aurelink/rentals/:rentalId/renew\` | numbers:write |
| POST | \`/aurelink/rentals/:rentalId/cancel\` | numbers:write |
| POST | \`/aurelink/nonvoip/orders\` | numbers:write |
| GET | \`/aurelink/nonvoip/orders/:id/messages\` | messages:read |
| POST | \`/aurelink/nonvoip/orders/:id/cancel\` | numbers:write |
| POST | \`/aurelink/dedicated/quote\` | numbers:write |
| POST | \`/aurelink/dedicated/orders\` | numbers:write |
| GET | \`/aurelink/dedicated/orders/:id/messages\` | messages:read |
| PATCH | \`/aurelink/dedicated/orders/:id/auto-renew\` | numbers:write |
| POST | \`/aurelink/dedicated/orders/:id/cancel\` | numbers:write |
| GET | \`/aurelink/orders\` | orders:read |
| GET | \`/aurelink/wallet\` | wallet:read |
| GET | \`/aurelink/wallet/ledger\` | wallet:read |

Pool selection and provider credentials are internal Aurelink implementation details and are not exposed as public API controls.

## Aurelink Communications

Communications endpoints are authenticated with a user session or a developer API key carrying the listed scope. Provider credentials are never returned to clients.

| Method | Route | Required API scope |
| --- | --- | --- |
| GET | `/aurelink/communications/overview` | `communications:read` |
| GET | `/aurelink/communications/messages` | `communications:read` |
| GET | `/aurelink/communications/messages/:id` | `communications:read` |
| GET | `/aurelink/communications/contacts?channel=sms\|email` | `communications:read` |
| POST | `/aurelink/communications/contacts` | `communications:send` |
| POST | `/aurelink/communications/sms/send` | `communications:send` |
| POST | `/aurelink/communications/email/send` | `communications:send` |
| POST | `/aurelink/verify/start` | `verify:write` |
| POST | `/aurelink/verify/:verificationId/check` | `verify:write` |

### Asynchronous delivery, retries and idempotency

SMS and email send requests are accepted into an encrypted PostgreSQL outbox and return HTTP 202 with a message record in `queued` state. A backend worker sends the message through the selected provider. Provider acceptance changes the state to `accepted`; authenticated provider callbacks update delivery states such as `delivered`, `bounced` or `failed`. Provider failures are retried with exponential backoff (up to eight attempts). A message that exhausts retries is marked failed.

Every send request must include a unique `Idempotency-Key` header (maximum 128 characters). Reuse the same key only for retries of the same payload. Reusing a key with a different recipient, sender, provider, or content returns HTTP 409. Omitting the key returns HTTP 400. Message content is stored as an encrypted queue payload; configure a stable `AURELINK_COMMUNICATIONS_ENCRYPTION_KEY` of at least 32 characters. The backend can fall back to `JWT_ACCESS_SECRET`, but a dedicated key is recommended and must remain stable across deployments.

The communications overview includes usage counts and units by channel/status. Usage is recorded per message. Configure `AURELINK_SMS_UNIT_PRICE_MINOR` and `AURELINK_EMAIL_UNIT_PRICE_MINOR` in USD cents to charge a fixed Aurelink retail rate per message; both default to `0` (no charge). When a non-zero rate is configured, the API reserves/debits the user's Aurelink wallet inside the same database transaction that enqueues the message. If the provider permanently rejects the message after all retries, the worker issues an idempotent wallet refund. `metered_amount_minor` reports configured Aurelink retail charges, not upstream provider cost or a tax-inclusive invoice.

### Contact and consent management

List contacts with `GET /aurelink/communications/contacts?channel=sms` or `channel=email`. Upsert a contact with `POST /aurelink/communications/contacts`:

```json
{
  "channel": "email",
  "address": "customer@example.com",
  "displayName": "Customer",
  "consentStatus": "opted_in",
  "consentSource": "signup_form_2026_11"
}
```

For an opt-in record, `consentSource` is required. Set `consentStatus` to `opted_out` to suppress the contact from campaigns; set it to `unknown` when there is no recorded permission. Campaign sends include only opted-in contacts, and hard bounces, spam complaints and unsubscribe events received through Resend are automatically added to the email suppression list.

### Message history

Use `GET /aurelink/communications/messages` to list the authenticated workspace's recent outbound messages. Optional query parameters: `limit` (1–100, default 50), `offset` (default 0), `channel` (`sms` or `email`), and `status`. Retrieve one message with `GET /aurelink/communications/messages/:id`. Message records include provider acceptance/delivery status and timestamps, not the original message body.

### Campaigns

| Method | Route | Required API scope |
| --- | --- | --- |
| GET | `/aurelink/communications/campaigns` | `communications:read` |
| POST | `/aurelink/communications/campaigns` | `communications:send` |
| POST | `/aurelink/communications/campaigns/:id/send` | `communications:send` |

Create a draft with `channel` (`sms` or `email`), `name`, and text content. Email campaigns also require `subject`; optional HTML is supported. Starting a campaign requires an approved `sender`. Only contacts with recorded `opted_in` consent are included; suppressed email addresses are skipped. SMS campaigns require an HTTPS opt-out/event `webUrl`. Campaign sends are queued per contact and campaign status moves to completed or paused when the queue reaches a terminal state. Start with a small opted-in test audience before sending to a full list.

Example campaign creation:

```http
POST /redom-backend/v1/aurelink/communications/campaigns
Authorization: Bearer aul_live_...
Content-Type: application/json

{
  "channel": "email",
  "name": "Product update",
  "subject": "Aurelink product update",
  "text": "We have shipped new developer API capabilities."
}
```

Start it with `POST /aurelink/communications/campaigns/:id/send` and a JSON body containing `sender`, optional `senderName`, and optional `provider`. SMS campaigns must also provide `webUrl`.

### SMS sending

```http
POST /redom-backend/v1/aurelink/communications/sms/send
Authorization: Bearer aul_live_...
Idempotency-Key: 6f0e2e18-8c8b-4f66-8a5f-2b8e1c9b81ad
Content-Type: application/json

{
  "recipient": "+14155550123",
  "sender": "AURELINK",
  "content": "Your order has shipped.",
  "category": "transactional",
  "provider": "brevo"
}
```

Supported adapters: Brevo transactional SMS and Twilio Programmable Messaging. The sender ID must be approved for the destination country. Marketing requests require a contact with recorded opt-in consent; campaign sending is not enabled by this endpoint.

### Email sending

```json
{
  "recipient": "customer@example.com",
  "sender": "notifications@example.com",
  "senderName": "Aurelink",
  "subject": "Order update",
  "text": "Your order has shipped.",
  "provider": "resend"
}
```

Supported adapters: Resend Email API and Brevo transactional Email API. The sender domain/address must be authenticated and approved by the provider. Suppressed recipients are rejected.

### Verification

Aurelink generates and validates the OTP itself. A session expires after five minutes and permits at most five verification attempts. Only a hash and separate per-session salt are stored; the OTP is never returned by the API. Provider services deliver the message but do not decide whether the verification succeeds.

### Provider setup and SMTP distinction

The communications overview reports which adapters have credentials configured. This does not mean that a sender ID/domain has been approved or that the provider account has available credits.

Brevo Email API and Brevo SMTP are different transports. SMTP requires a Brevo SMTP login and SMTP key, distinct from the REST API key. The current implementation provides REST API delivery; customer-facing Aurelink SMTP relay hosting, credential issuance and SMTP ingress are a separate infrastructure phase and must not be represented as already active.

Resend and Brevo both require domain/sender authentication at the provider. SMS sender IDs may need country-specific registration and approval. Provider acceptance is not handset/inbox delivery confirmation; update delivered/bounced states only from authenticated provider webhooks.

## Webhooks

Create HTTPS endpoints in Developer → Webhooks. Choose **Test** or **Live** for each endpoint. Sandbox events are delivered only to test endpoints; production order and wallet events are delivered only to live endpoints. Subscribe to:

- \`activation.created\`, \`activation.updated\`, \`activation.cancelled\`
- \`sms.received\`
- \`rental.created\`, \`rental.updated\`, \`rental.expiring\`
- \`dedicated.created\`, \`dedicated.updated\`
- \`wallet.credited\`, \`wallet.debited\`

Each delivery includes an event ID, type, creation timestamp and data object. The signing secret is displayed once and stored encrypted at rest. Configure a stable, random `AURELINK_WEBHOOK_ENCRYPTION_KEY` (at least 32 characters) in every backend environment; keep it stable across deploys and backups. Aurelink signs the exact raw request body:

\`\`\`
HMAC_SHA256(secret, timestamp + "." + rawBody)
\`\`\`

Headers:

- \`Aurelink-Event\`
- \`Aurelink-Delivery\`
- \`Aurelink-Timestamp\`
- \`Aurelink-Signature: v1=<hex>\`

Verify the signature using a constant-time comparison and reject timestamps older than five minutes. Process event IDs idempotently. Respond with a 2xx status to acknowledge delivery.

Failed deliveries are retried with increasing delays. Inspect delivery status in Developer → Webhooks → Deliveries and manually retry terminal failures when appropriate.

## SDK

The official Node SDK source is in \`sdk/aurelink-node\`. It supports services, countries, activations, rentals, NonVoIP, dedicated numbers, orders, wallet and webhook signature verification. The package can be published to npm as \`@aurelink/node\` when the Aurelink npm publisher account is configured.

