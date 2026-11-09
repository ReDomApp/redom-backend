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

Create separate test and live keys in the Aurelink Developer workspace. The account also supports isolated projects, project-bound communications workspaces, request logs, usage summaries, and webhook endpoint management. Test keys begin with \`aul_test_\`; live keys begin with \`aul_live_\`.

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

## Developer projects and credentials

Create developer projects in the authenticated Aurelink account:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/aurelink/account/projects` | List projects and their active API-key counts |
| POST | `/aurelink/account/projects` | Create an isolated communications project |
| PATCH | `/aurelink/account/projects/:id` | Rename, suspend, reactivate or archive a project |
| GET | `/aurelink/account/api-keys` | List key metadata and associated project |
| POST | `/aurelink/account/api-keys` | Issue a test/live API key, optionally with `projectId` |
| PATCH | `/aurelink/account/api-keys/:id` | Change label, scopes, rate limit or project assignment |
| POST | `/aurelink/account/api-keys/:id/rotate` | Rotate the key secret |
| DELETE | `/aurelink/account/api-keys/:id` | Revoke the key |

Project API keys are restricted to the project's isolated communications workspace (contacts, sender identities, domains, messages, campaigns and SMTP credentials). They cannot access number purchasing, the account wallet, profile/security routes or another project's workspace. A suspended or archived project immediately blocks its keys. Create one project per application/environment boundary and issue separate keys with only the required scopes.

Example project creation:

```json
{
  "name": "Production checkout",
  "description": "Order confirmations and OTP delivery"
}
```

Then issue a project key by including the returned `projectId` in the API-key creation request. The secret is returned once; store it in a server-side secret manager. SMTP credentials remain separate and are managed independently.

### Request logs and usage

- `GET /aurelink/account/api-logs` — paginated request logs with request IDs, method, path, status, latency, environment and key label. Filter with `limit`, `offset`, `environment`, and `status`.
- `GET /aurelink/account/api-usage` — 30-day request/error/latency summary and active key counts.

### Developer webhooks

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/aurelink/account/webhooks` | List webhook endpoints |
| POST | `/aurelink/account/webhooks` | Create endpoint; signing secret shown once |
| PATCH | `/aurelink/account/webhooks/:id` | Enable/disable or update description |
| GET | `/aurelink/account/webhooks/:id/deliveries` | Inspect delivery attempts and responses |
| POST | `/aurelink/account/webhooks/:id/rotate-secret` | Rotate the signing secret |

Webhook deliveries are retried with backoff. Requests include `aurelink-event`, `aurelink-delivery`, `aurelink-timestamp`, and `aurelink-signature` headers. The signature is HMAC-SHA256 over `timestamp + "." + raw JSON body`, prefixed with `v1=`. Receivers should verify the timestamp and signature against the raw request body and deduplicate on event ID.

## Aurelink Communications

Communications endpoints are authenticated with a user session or a developer API key carrying the listed scope. Provider credentials are never returned to clients.

| Method | Route | Required API scope |
| --- | --- | --- |
| GET | `/aurelink/communications/overview` | `communications:read` |
| GET | `/aurelink/communications/analytics?days=30&channel=email` | `communications:read` |
| GET | `/aurelink/communications/messages` | `communications:read` |
| GET | `/aurelink/communications/messages/:id` | `communications:read` |
| POST | `/aurelink/communications/messages/:id/retry` | `communications:send` |
| GET | `/aurelink/communications/contacts?channel=sms\|email` | `communications:read` |
| GET | `/aurelink/communications/templates` | `communications:read` |
| POST | `/aurelink/communications/templates` | `communications:manage` |
| PATCH | `/aurelink/communications/templates/:id` | `communications:manage` |
| DELETE | `/aurelink/communications/templates/:id` | `communications:manage` |
| POST | `/aurelink/communications/contacts` | `communications:send` |
| POST | `/aurelink/communications/sms/send` | `communications:send` |
| POST | `/aurelink/communications/email/send` | `communications:send` |
| POST | `/aurelink/verify/start` | `verify:write` |
| POST | `/aurelink/verify/:verificationId/check` | `verify:write` |

### Asynchronous delivery, retries and idempotency

SMS and email send requests are accepted into an encrypted PostgreSQL outbox and return HTTP 202 with a message record in `queued` state. A backend worker sends the message through the selected provider. Provider acceptance changes the state to `accepted`; authenticated provider callbacks update delivery states such as `delivered`, `bounced` or `failed`. Provider failures are retried with exponential backoff (up to eight attempts). A message that exhausts retries is marked failed.

Email sends support optional `templateId` plus `variables`, base64 `attachments` (maximum 10 files and 10 MB combined), and `scheduledAt` (30 seconds to 30 days in the future). Templates must be marked `active` before use. Template variables use `{{variableName}}`; values inserted into HTML are HTML-escaped. Scheduled jobs remain in the encrypted outbox until their scheduled timestamp.

Every send request must include a unique `Idempotency-Key` header (maximum 128 characters). Reuse the same key only for retries of the same payload. Reusing a key with a different recipient, sender, template, schedule, attachment or content returns HTTP 409. Omitting the key returns HTTP 400. Message content is stored as an encrypted queue payload; configure a stable `AURELINK_COMMUNICATIONS_ENCRYPTION_KEY` of at least 32 characters. The backend can fall back to `JWT_ACCESS_SECRET`, but a dedicated key is recommended and must remain stable across deployments.

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

Use `GET /aurelink/communications/messages` to list the authenticated workspace's recent outbound messages. Optional query parameters: `limit` (1–100, default 50), `offset` (default 0), `channel` (`sms` or `email`), and `status`. Retrieve one message with `GET /aurelink/communications/messages/:id`. Message records include provider acceptance/delivery status and timestamps, not the original message body. Retry a terminally failed direct message with `POST /aurelink/communications/messages/:id/retry` and a new `Idempotency-Key`; campaign and verification messages must be retried through their respective workflows.

### Provider configuration

Set these values only on the backend service (never in browser/mobile builds):

| Variable | Purpose |
| --- | --- |
| `AURELINK_BREVO_API_KEY` | Required when Brevo is selected for SMS or Email |
| `AURELINK_RESEND_API_KEY` or `RESEND_API_KEY` | Required when Resend is selected for Email |
| `AURELINK_TWILIO_ACCOUNT_SID`, `AURELINK_TWILIO_AUTH_TOKEN` | Twilio credentials; existing `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are accepted as fallbacks |
| `AURELINK_TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_PHONE_NUMBER` | Twilio sender configuration |
| `AURELINK_COMMUNICATIONS_ENCRYPTION_KEY` | Stable 32+ character key for encrypting queued message payloads; falls back to `JWT_ACCESS_SECRET` |
| `AURELINK_VERIFICATION_PEPPER` | Optional dedicated 32+ character OTP HMAC secret; falls back to `JWT_ACCESS_SECRET` |
| `AURELINK_RESEND_WEBHOOK_SECRET` | Resend/Svix signing secret for delivery callbacks |
| `AURELINK_BREVO_SMTP_LOGIN`, `AURELINK_BREVO_SMTP_KEY` | Separate Brevo SMTP credentials for the standalone SMTP relay; not the REST API key |
| `AURELINK_SMTP_HOSTNAME` | Public hostname of the deployed SMTP TCP relay; leave unset until deployed |
| `AURELINK_TWILIO_STATUS_CALLBACK_URL` | Public HTTPS URL ending in `/aurelink/webhooks/twilio/status` |
| `AURELINK_DEFAULT_SMS_PROVIDER`, `AURELINK_DEFAULT_EMAIL_PROVIDER` | Primary provider selection |
| `AURELINK_SMS_FALLBACK_PROVIDER`, `AURELINK_EMAIL_FALLBACK_PROVIDER` | Optional failover provider |
| `AURELINK_SMS_UNIT_PRICE_MINOR`, `AURELINK_EMAIL_UNIT_PRICE_MINOR` | Fixed retail charge per message in USD cents; default `0` |

The worker falls back to `JWT_ACCESS_SECRET` if dedicated encryption/verification secrets are unset. For production, set dedicated stable values and retain them across deploys and restarts. Configure the Resend webhook to point to `/aurelink/webhooks/resend`; configure Twilio's status callback URL to the full deployed API URL.

### Domain authentication, DNS and sender registration

**Aurelink platform routing:** the platform's Resend primary sending identity is `mail.wnncompany.com`; Brevo fallback uses its own authenticated identity, currently `market.wnncompany.com`. Keep each provider's DNS records attached to its own domain. Do not create a second SPF record at the same hostname, and do not add Resend records to the Brevo domain or vice versa. The public SMTP relay hostname (`AURELINK_SMTP_HOSTNAME`) is a separate TCP service endpoint; it is not automatically the same thing as either provider's sender domain.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/aurelink/communications/domains` | List workspace email domains |
| POST | `/aurelink/communications/domains` | Create a domain in Resend or Brevo and retrieve that provider's actual DNS records |
| POST | `/aurelink/communications/domains/:id/check` | Re-check provider state and public DNS |
| POST | `/aurelink/communications/domains/:id/verify` | Ask the provider to verify/authenticate the domain, then refresh status |
| POST | `/aurelink/communications/dns/cloudflare/connect` | Connect a zone-scoped Cloudflare API token |
| GET | `/aurelink/communications/dns/cloudflare/connections` | List connected Cloudflare zones |
| POST | `/aurelink/communications/domains/:id/apply-dns` | Add provider records to the connected Cloudflare zone without overwriting conflicts |
| POST | `/aurelink/webhooks/brevo` | Receive authenticated Brevo transactional delivery events |
| GET | `/aurelink/communications/email-senders` | List email sender identities |
| POST | `/aurelink/communications/email-senders` | Create an email sender identity in Resend/Brevo |
| POST | `/aurelink/communications/email-senders/:id/check` | Refresh sender verification state |
| GET | `/aurelink/communications/senders` | List SMS sender registration requests |
| POST | `/aurelink/communications/senders` | Create a sender registration request for a country/provider |
| POST | `/aurelink/communications/senders/:id/review` | Admin-only evidence-backed provider status update |

Create a domain with:

```json
{
  "domain": "example.com",
  "provider": "resend"
}
```

Aurelink creates the domain with the selected provider and stores the provider's real DNS instructions. Resend and Brevo do not necessarily require identical record sets. Depending on provider and enabled capabilities, the returned records may include TXT ownership verification, SPF, DKIM (TXT or CNAME), DMARC, and MX records. Aurelink does not invent a generic MX record: it displays and checks only records returned by the selected provider. MX is required only when the selected service/capability needs it; it is not a universal requirement for outbound email authentication. SPF must remain a single TXT policy at a hostname; if one already exists, merge authorized includes into it rather than publishing a second SPF record.

Check records with `POST /aurelink/communications/domains/:id/check`. The response includes each expected record, observed DNS values, missing/conflicting status, and provider verification state. A domain becomes send-enabled only when the provider reports it verified/authenticated. DNS propagation alone does not mean the provider has approved it. Brevo additionally requires a sender email identity: create it after domain authentication, click the verification email Brevo sends, and call the sender check endpoint. Email delivery through Brevo is blocked until that sender is active.

For automatic DNS changes, first connect a Cloudflare API token scoped to the customer's zone with **Zone:Read** and **DNS:Edit** permissions:

```json
{
  "domain": "example.com",
  "zoneId": "CLOUDFLARE_ZONE_ID",
  "apiToken": "CLOUDFLARE_SCOPED_API_TOKEN"
}
```

The token is encrypted at rest using `AURELINK_COMMUNICATIONS_ENCRYPTION_KEY`. It is never returned. Apply with `POST /aurelink/communications/domains/:id/apply-dns`. Exact existing records are left untouched. Conflicting records are reported rather than overwritten. Existing SPF records are never replaced automatically. If a customer does not connect Cloudflare, copy the exact records into their DNS host manually.

**MX distinction:** Resend/Brevo sending-domain MX records (often on a bounce/return-path subdomain) are not the same as MX records for receiving mailboxes at the root domain. Aurelink's SMTP submission relay is outbound-only; it does not host inboxes or receive inbound email. Do not point a customer's root MX at the Aurelink SMTP submission service.

#### SMS sender IDs

A sender request requires `sender`, `provider` (`twilio` or `brevo`), `countryCode` (ISO 3166-1 alpha-2), `businessName`, `businessWebsite`, `messageUseCase`, and `sampleMessage`. Optional fields include `estimatedMonthlyVolume` and HTTPS registration document references. This endpoint handles alphanumeric sender IDs only (1–11 ASCII letters/digits, with at least one letter); phone-number, toll-free and short-code registration are separate country-specific workflows. Alphanumeric sender IDs are not supported in the United States or Canada.

The initial state is `pending_customer_submission`; it is **not** submitted to a carrier and is not approved. Provider/carrier registration is country-specific and may require business documents, brand authorization, sample content, use-case review and a provider reference. When the provider has accepted a submission, an authorized Aurelink administrator records its real provider reference as `submitted`. An `approved` decision additionally requires an HTTPS link to the provider/carrier approval evidence. Aurelink never turns a request into an approved sender merely because the user entered a brand name.

SMS send, OTP and campaign requests require `countryCode` and an approved sender for that country and provider. If SMS failover is configured, the sender must be approved with both the primary and fallback providers for that country. Sender IDs are not universally supported; check destination-country restrictions before submitting.

#### Provider webhook setup

The shared Brevo transactional webhook is provisioned by an Aurelink communications administrator using `POST /aurelink/communications/providers/brevo/webhook/configure`. Configure `AURELINK_BREVO_WEBHOOK_SECRET` and `AURELINK_BREVO_WEBHOOK_URL` first. Aurelink creates or updates the Brevo webhook subscription for sent, delivered, opened, clicked, bounce, spam and unsubscribe events. This is an account-level provider operation, not a customer-supplied webhook endpoint.

#### SMTP credentials and relay

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/aurelink/communications/smtp/credentials` | List SMTP usernames and status (never passwords) |
| POST | `/aurelink/communications/smtp/credentials` | Issue a new SMTP username/password; password is shown once |
| POST | `/aurelink/communications/smtp/credentials/:id/rotate` | Issue a replacement and revoke the old credential atomically |
| DELETE | `/aurelink/communications/smtp/credentials/:id` | Revoke an SMTP credential immediately |

The SMTP submission relay is a separate TCP service in `infra/aurelink-smtp`. Its routing is Resend SMTP primary (`smtp.resend.com:465`) and Brevo SMTP fallback (`smtp-relay.brevo.com:587`). Aurelink accepts client submission on port 587 with STARTTLS and port 465 with implicit TLS; optional port 25 is disabled by default and, if enabled, requires STARTTLS and SMTP authentication. For Brevo delivery receipts, configure a Brevo transactional webhook with events `delivered`, `hardBounce`, `softBounce`, `blocked`, `spam`, `invalid`, `deferred`, and `unsubscribed`; set its URL to `https://YOUR_API_HOST/aurelink/webhooks/brevo` and configure Bearer authentication using the same `AURELINK_BREVO_WEBHOOK_SECRET` stored by Aurelink. Brevo supports Bearer-authenticated webhooks. The SMTP relay adds an `X-Mailin-custom` correlation value so fallback delivery events can update the correct SMTP message. Resend uses username `resend` and the Resend API key as password. Brevo requires the separate SMTP login and SMTP key; the Brevo REST API key is not an SMTP password. The relay requires authenticated STARTTLS, verifies the original From domain with Resend for primary delivery, and uses a separately verified Brevo sender identity on a Brevo-authenticated domain for fallback. When failover occurs, Aurelink changes the provider-facing From address to the verified Brevo sender and preserves the original address as Reply-To. The two providers do not need to authenticate the same domain. The relay enforces message-size/recipient/rate limits and does not act as an open relay.

Aurelink's HTTP API can issue and revoke credentials, but SMTP connections will not work until the separate relay is deployed on a host with public TCP submission access, TLS certificates and the required provider credentials. Render web services expose only one public HTTP port, not a public arbitrary SMTP port; Render free services also block outbound SMTP ports 25, 465 and 587. Choose a TCP-capable host and set `AURELINK_SMTP_HOSTNAME` before advertising the hostname to developers. The relay does not receive inbound mail or host mailboxes.

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
  "countryCode": "US",
  "sender": "AURELINK",
  "content": "Your order has shipped.",
  "category": "transactional",
  "provider": "brevo"
}
```

Supported adapters: Brevo transactional SMS and Twilio Programmable Messaging. The sender ID must be approved for the destination country and both Brevo and Twilio when the standard fallback route is enabled. Brevo sender registration is country-specific; Twilio alphanumeric IDs are not supported in the US or Canada. Aurelink records a pending request and gives the provider-specific registration instructions; it does not claim to submit or approve a carrier registration when the provider requires its own console workflow. Include the ISO `countryCode` field. If fallback is enabled, the sender must be approved on both providers. Marketing requests require a contact with recorded opt-in consent; campaign sending is not enabled by this endpoint.

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

Supported adapters: Resend Email API and Brevo transactional Email API. The sender domain must be verified with the selected provider. If a fallback provider is configured, the domain must also be verified with that fallback provider. Suppressed recipients are rejected.

### Verification

Aurelink generates and validates the OTP itself. SMS verification requests must include the ISO destination `countryCode` and an approved sender for that country/provider; email verification requires an authenticated sender domain. A session expires after five minutes and permits at most five verification attempts. Only a per-session HMAC hash and separate random salt are stored; the OTP is never returned by the live API. Configure a stable `AURELINK_VERIFICATION_PEPPER` (32+ characters); if unset, the backend uses `JWT_ACCESS_SECRET`. Provider services deliver the message but do not decide whether the verification succeeds.

### Provider setup and SMTP distinction

The communications overview reports which adapters have credentials configured. This does not mean that a sender ID/domain has been approved or that the provider account has available credits.

Brevo Email API and Brevo SMTP are different transports. SMTP requires a Brevo SMTP login and SMTP key, distinct from the REST API key. The REST API delivery path is active in code. The new SMTP credential APIs and standalone TCP relay package are also implemented in this branch, but the relay has not been deployed to a public TCP-capable host and must not be advertised as live until its DNS hostname, TLS certificate and provider credentials are configured.

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

