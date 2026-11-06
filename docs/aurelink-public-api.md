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

## Webhooks

Create HTTPS endpoints in Developer → Webhooks. Choose **Test** or **Live** for each endpoint. Sandbox events are delivered only to test endpoints; production order and wallet events are delivered only to live endpoints. Subscribe to:

- \`activation.created\`, \`activation.updated\`, \`activation.cancelled\`
- \`sms.received\`
- \`rental.created\`, \`rental.updated\`, \`rental.expiring\`
- \`dedicated.created\`, \`dedicated.updated\`
- \`wallet.credited\`, \`wallet.debited\`

Each delivery includes an event ID, type, creation timestamp and data object. The signing secret is displayed once. Aurelink signs the exact raw request body:

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

