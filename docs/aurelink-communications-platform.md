# Aurelink Communications Platform — Billing and Developer Operations

This document covers the backend APIs added for usage billing, sending-domain lifecycle, reputation monitoring and workspace teams. Inbound mailboxes, inbound SMTP and IMAP are intentionally out of scope.

## Usage billing

Aurelink uses one USD wallet per Aurelink user and one communications usage ledger scoped to a workspace. The price catalogue supports:

- `sms_segment`: one SMS segment, with country, provider and category overrides.
- `email_message`: one REST email message.
- `smtp_message`: one accepted SMTP recipient message through the Aurelink-owned gateway.

Price matching precedence is workspace override, exact country/provider/category, then wildcard defaults. Prices are stored as integer minor units (USD cents). An active, positive price is mandatory. The system deliberately does not treat a missing price as free.

For queued REST messages, Aurelink reserves wallet credit in the same database transaction as the message/job insert. The charge is captured when the provider accepts the send. A final delivery failure after retries triggers an idempotent refund. Delivery callbacks update the usage state but do not refund a provider-accepted message merely because it later bounces; provider acceptance is the billable event.

The Aurelink-owned SMTP gateway performs the same wallet reservation before upstream submission, then captures on provider acceptance or refunds on provider rejection. SMTP is billed per accepted recipient, not per connection.

Temporary direct-Resend mode is an explicit exception: when `AURELINK_SMTP_TEMPORARY_DIRECT_RESEND=true`, customers connect directly to Resend using a domain-scoped Resend key. Those sessions bypass Aurelink's TCP gateway and therefore do not pass through the gateway's per-send wallet meter. Disable this temporary mode only after the Aurelink gateway is deployed and verified, and reissue credentials.

### Customer endpoints

- `GET /aurelink/communications/billing/overview`
- `GET /aurelink/communications/billing/usage?limit=50`
- `GET /aurelink/communications/billing/statement?month=YYYY-MM`

Statements are usage summaries, not tax invoices or payment receipts. The current billing implementation is prepaid USD wallet metering; postpaid credit limits, tax invoices and automatic top-ups are not part of this change.

### Aurelink administrator price endpoints

- `GET /aurelink/admin/communications/prices`
- `POST /aurelink/admin/communications/prices`
- `POST /aurelink/admin/communications/prices/:id/disable`

Create a price with `service`, optional `workspaceId`, `countryCode`, `provider`, `category`, `unitPriceMinor`, and optional `effectiveFrom`. These routes require an Aurelink administrator identity configured in `AURELINK_ADMIN_USER_IDS`.

## Sending-domain lifecycle

- `POST /aurelink/communications/domains/:id/suspend`
- `POST /aurelink/communications/domains/:id/resume`
- `DELETE /aurelink/communications/domains/:id`

Suspension blocks new sends because sending routes require a verified domain. Active domain-scoped SMTP provider keys are revoked and local credentials are disabled. Resuming moves the domain back to verification pending; it does not silently restore old credentials. Removal revokes active SMTP keys, removes the provider domain through the Resend or Brevo domain API, disables sender identities and retains historical message records.

### Custom tracking subdomains

- `PUT /aurelink/communications/domains/:id/tracking-domain`
- `POST /aurelink/communications/domains/:id/tracking-domain/verify`

Custom tracking subdomains use Resend's `tracking_subdomain` domain setting. Aurelink retrieves the provider-issued Tracking CNAME, checks DNS and invokes provider verification. Resend handles the tracking redirect, open pixel and TLS certificate. The tracking subdomain is configured once and is not removable through this API because the provider restricts removal.

## Reputation monitoring

- `GET /aurelink/communications/reputation`
- `POST /aurelink/communications/reputation/alerts/:id/acknowledge`

A background worker calculates rolling 30-day email reputation metrics and creates alerts for elevated bounce, complaint and critical score conditions. The current score is an Aurelink operational indicator, not a guarantee of inbox placement or a replacement for provider reputation tools. Alert events can be delivered through developer webhooks as `email.reputation.alert`.

## Workspace teams

- `GET /aurelink/communications/team/members`
- `POST /aurelink/communications/team/invitations`
- `POST /aurelink/communications/team/invitations/accept`
- `PATCH /aurelink/communications/team/members/:id/role`
- `DELETE /aurelink/communications/team/members/:id`

Roles: owner, admin, developer, analyst and billing. Invitations expire after seven days and can only be accepted by a signed-in Aurelink account whose verified email matches the invitation. The invitation token is returned once to the creating client; that client must deliver the invitation email. Shared-workspace requests send `X-Aurelink-Workspace-Id`. The backend validates active membership and role permissions before processing workspace-scoped communications requests.

## Sender ID registration and security gate

Sender ID applications are fail-closed. A customer must first register a public HTTPS business website in Aurelink Developer and prove domain control using a DNS TXT challenge at `_aurelink-verification.<domain>`. A URL typed into a form is not treated as a verified website. Aurelink rechecks the same ownership proof immediately before security approval and on a rolling 24-hour worker schedule. If the record disappears or changes, Aurelink revokes website verification, suspends associated Sender IDs, cancels requests not yet submitted to Brevo and blocks delivery. Every SMS send also requires a verified website record with a DNS check no older than 25 hours; stale or pending verification fails closed.

Before an application can enter provider submission, it must include the registered legal business name, business address and registration country, business type, registration number/type, local-or-international company location, business contact name/email/E.164 phone, destination country, Sender ID, SMS purpose, use-case description, sample messages, estimated monthly volume, Privacy Policy URL and Terms and Conditions URL hosted on the verified business domain or its subdomain, a recipient opt-in evidence document, and genuine registration/brand-authorization documents uploaded through Aurelink's private evidence endpoint. Aurelink computes SHA-256 from the actual file bytes and stores the files privately in R2. US/Canada applications additionally require city/state/region/postal code, business-domain contact email, a Brevo-provided or ported toll-free number and evidence of that number source. The applicant must explicitly attest to document authenticity, brand authorization, recipient consent and policy review.

Aurelink security administrators must manually complete the security checklist before clearing an application: legal business identity, brand ownership/authorization, document authenticity, website content, the required Privacy Policy non-sharing statement for SMS opt-in data/consent, Terms and Conditions disclosures (business identity, products, message frequency, rates, support contact and STOP instructions), opt-in evidence, use case/sample message and destination-specific carrier requirements. US/Canada applications additionally require verified toll-free eligibility, business-domain contact email, and sample content containing the brand plus STOP/HELP instructions. Only then can the registration move to `scheduled_for_brevo` and enter the one-hour hold. Aurelink re-reads each private object and recomputes its SHA-256 before security clearance; a mismatch fails the review. Hash integrity does not prove that a document is genuine or legally valid, so the reviewer must independently inspect the original document. Automated AI-document detection is not claimed. Suspicious or unverifiable submissions remain blocked for manual review or rejection. When a security administrator marks an application as a security failure, they must choose a restriction period from 1 to 365 days. The restriction blocks new Sender ID applications and SMS delivery through that workspace until it expires; enforcement checks the expiry on each request and does not depend on a cleanup worker.

Provider submission and provider approval are separate transitions. Submission requires a real provider reference; approval requires a real provider reference and HTTPS evidence of provider/carrier approval. SMS sending additionally requires `status=approved`, `registration_state=approved`, a passed Aurelink security review and a verified website association. An admin cannot bypass the security gate through the review endpoint.

Current endpoints:

- `POST /aurelink/communications/websites` — create a DNS ownership challenge.
- `POST /aurelink/communications/websites/:id/verify` — verify the published TXT challenge.
- `GET /aurelink/communications/websites` — list verified website records.
- `POST /aurelink/communications/senders` — create a complete application; it enters security review and is not submitted to a provider.
- `GET /aurelink/communications/senders` — view applications and approval status.
- `POST /aurelink/communications/senders/:id/review` — administrator-only security clearance, rejection, provider submission or provider approval.

Toll-free registrations are not interchangeable with alphanumeric Sender IDs. US/Canada requests are accepted only when they contain a valid +1 toll-free number and the required business-contact, address, website, privacy/terms, opt-in and sample-message evidence. Alphanumeric US/Canada requests are rejected. Other North American Numbering Plan (+1) territories require a Brevo-provided or ported number sender; their number-based registration workflow remains blocked until implemented.

## Aurelink SMS destination coverage and Brevo Sender ID workflow

The supported SMS destination registry currently contains 205 unique country/territory entries and is seeded from `sms-country-registry.ts` into `aurelink_sms_supported_countries`. It includes the product-approved list supplied by Aurelink operations, with ISO alpha-2 identifiers and E.164 international calling prefixes. Singapore (`SG`) is intentionally disabled and excluded. The registry is authoritative for destination eligibility; the presence of a country does not imply that every sender type is permitted there or that Brevo has approved a Sender ID.

Customer API:

- `POST /aurelink/communications/senders/evidence` — upload PDF/JPEG/PNG registration and brand-authorization evidence (maximum 10 MB each; 30 files/100 MB per user per 24 hours). The backend validates file signatures, computes SHA-256 over the original bytes and stores the object privately in R2. The response returns an evidence document ID; applications must submit these IDs, not public document URLs or client-supplied hashes.
- `GET /aurelink/communications/senders/evidence` — list the authenticated user's evidence IDs, file hashes and attachment states.
- `DELETE /aurelink/communications/senders/evidence/:documentId` — delete only the authenticated user's unattached evidence upload; attached application evidence is immutable to the applicant.
- `GET /aurelink/communications/sms/countries` returns enabled destinations, ISO country codes, E.164 calling prefixes and international-format examples.
- SMS send, campaign and verification routes validate that the destination country is enabled and the recipient number is in international E.164 format with the selected country's calling prefix.
- A country not in the registry is rejected before queueing or provider submission.

Sender registration workflow:

1. Customer submits a complete application to Aurelink. It is saved as `security_review`; this does not contact Brevo.
2. Aurelink performs its own identity, business, brand, document, website, policy, opt-in and destination-rule review. Rejection ends the process.
3. On Aurelink security approval, Aurelink creates a cryptographically random request token, stores only its SHA-256 hash plus AES-256-GCM encrypted token material, links it to the sender application and schedules the request for one hour later.
4. The communications worker moves due requests to `brevo_submission_ready`. The administrator submission queue exposes the request details. The correlation token is revealed once to an authorized Aurelink communications administrator.
5. After the operator submits the application in Brevo, the real Brevo registration reference is recorded against the same application and token. The request remains pending while Brevo reviews it.
6. Intermediate Brevo statuses update the mapped request but do not consume the token. Only a terminal success/approval or rejection/failure event consumes it, records the terminal payload and closes the token.
7. Repeated callback event IDs are deduplicated. A terminal token cannot be reused to alter the final result.

Administrator endpoints:

- `GET /aurelink/admin/communications/senders/:id/evidence/:documentId` — administrator-only private evidence retrieval with an integrity check.
- `GET /aurelink/admin/communications/sender-submissions` — due and in-progress Brevo requests.
- `POST /aurelink/admin/communications/sender-submissions/:id/reveal-token` — one-time token reveal after the one-hour hold.
- `POST /aurelink/admin/communications/sender-submissions/:id/rotate-token` — invalidate and replace a lost token only before provider submission; the new token must then be revealed once.
- `POST /aurelink/admin/communications/sender-submissions/:id/mark-submitted` — map the actual Brevo reference to the request.
- `POST /aurelink/admin/communications/sender-submissions/:id/reconcile` — record an actual status returned through Brevo's operator workflow.
- `POST /aurelink/webhooks/brevo/sender-registration` — authenticated callback contract for a supported Brevo callback or an Aurelink-controlled integration relay. It requires `AURELINK_BREVO_SENDER_REGISTRATION_WEBHOOK_SECRET`.

Important provider limitation: Brevo's published Sender ID registration instructions currently direct customers to submit through Brevo Console (Settings → Campaigns → SMS Sender ID) and track progress in the Brevo notification center/email. The public Brevo API documentation exposes SMS sending and email sender management, but does not document an API endpoint for creating or submitting SMS Sender ID registration applications, nor a Sender ID registration webhook. Therefore the one-hour scheduler currently creates a secure Aurelink operator submission task; it does not falsely claim an automatic Brevo API submission. A real Brevo registration reference and returned terminal status must be recorded or relayed into Aurelink. The callback endpoint is ready for such a verified relay, but must not be described as a native Brevo webhook until Brevo documents/supports it. The scheduled token is encrypted with AES-256-GCM using the stable `AURELINK_COMMUNICATIONS_ENCRYPTION_KEY` (minimum 32 characters). This key must be configured before an administrator can clear an application; there is no JWT-secret fallback. The administrator can reveal the plaintext token once; Aurelink erases its encrypted copy immediately after reveal. The hash remains for status correlation until a terminal Brevo outcome consumes the token.

Country-specific Sender ID formats and supporting requirements still apply. Aurelink enforces Brevo's 3–11 character Sender ID length, requires at least one letter, rejects emoji/numbers-only sender IDs, and applies the published country restrictions on digits, spaces and special characters. France defaults to the non-Enterprise letters-and-digits-only rule; the UK permits only its documented limited character set. Digits are prohibited in Bulgaria, Gambia, Guatemala, Honduras, Liberia, Nicaragua, Nigeria, Pakistan, Romania and Rwanda. All North American Numbering Plan (+1) destinations require a Brevo-provided or ported numeric sender rather than a free-form alphanumeric ID. US and Canada use the registered toll-free path implemented here; other +1 territories remain in SMS coverage but their dedicated number-based sender workflow is explicitly blocked until implemented. The sending adapter validates the same country rules again at send time.

## SDKs

- Node.js SDK: `sdk/aurelink-node`
- Java SDK source: `sdk/aurelink-java`

The Java package is source code in this repository and is not yet published to a Maven repository. SDK publication and release automation are separate from adding the source package.

## Provider submission safety, reconciliation and refunds

Provider submission outcomes are classified as either a confirmed rejection or an unknown outcome. HTTP 4xx responses (except timeout-like 408/425) are treated as confirmed rejections; HTTP 429 is a confirmed rate-limit rejection and is retried against the same provider with backoff. HTTP 5xx, request timeouts, connection failures, unreadable responses and successful responses without a provider message ID are treated as unknown because the provider may have accepted the message before the connection failed.

Unknown submissions move to the manual_review job state, unknown message state and retain the wallet reservation. They are not automatically retried, sent through a fallback provider, captured as accepted, or refunded. This prevents duplicate delivery and prevents Aurelink from refunding a customer when the provider may already have accepted the message. A worker restart while a job is in the provider-submission in_flight state also moves it to manual review rather than blindly resending.

Automatic provider fallback is permitted only after an explicit, non-retryable provider rejection. Timeouts, 5xx responses, 408/425, 429, connection failures and incomplete success responses never trigger a second-provider send. Provider acceptance is recorded with its provider message ID; capture repair re-processes accepted/delivered usage whose original wallet reservation remains uncaptured.

Aurelink refunds only after a confirmed terminal submission failure following the configured retry policy. Refunds are idempotent and use the original message charge reference with a distinct refund reference. A delivery bounce after provider acceptance is not automatically refunded because the provider accepted the billable submission. An unknown/manual-review outcome remains financially reserved until an operator reconciles the provider result: confirmed acceptance captures the charge; confirmed non-acceptance/failure triggers the one-time refund. Do not manually mark an unknown outcome failed without checking the provider account first.

The worker schema adds submission_state (not_started, in_flight, accepted, rejected, unknown) and the manual_review job state. Monitor this queue operationally; it must be reconciled before enabling production traffic at scale.

### Ambiguous provider submission reconciliation API

An uncertain provider submission is intentionally held for operator review. The following Aurelink administrator endpoints are available:

- `GET /aurelink/admin/communications/manual-review?limit=50` — lists ambiguous submissions without returning encrypted payloads or message content.
- `POST /aurelink/admin/communications/messages/:id/reconcile` — resolves one manual-review item. Requires `outcome` (`accepted` or `rejected`) and an `evidenceReference` documenting the provider-console check. For `accepted`, it also requires the actual provider `providerMessageId`.

Both endpoints require a signed-in Aurelink account whose user ID is explicitly listed in `AURELINK_ADMIN_USER_IDS`. The reconciliation operation locks the job and message in one database transaction, rejects already-resolved records, prevents reuse of a provider message ID, writes an immutable administrator audit row, and then either captures the reserved charge (accepted) or issues the idempotent refund (confirmed not accepted). The API never exposes the stored message body or encrypted provider payload in the manual-review listing. The evidence reference should identify the provider console record, ticket or other independently checked evidence; it is an audit pointer, not proof automatically fetched by Aurelink.


## Aurelink Mail billing and enforcement

Outbound email billing is owned by Aurelink. Provider acceptance is the billable submission point; delivery, bounce, open and click events update message analytics but do not silently create a second charge or automatic refund.

### Billing modes

- **Free:** 100 accepted/reserved outbound emails per database day and up to 100,000 stored email contacts. Free daily usage is reserved atomically before provider submission. If the daily allowance is exhausted, prepaid credits may be used; otherwise the send is rejected.
- **Monthly subscription:** Stripe recurring monthly checkout for one exact configured allowance. The subscription stores its billing period, allowance, accepted usage and in-flight reservations. Usage resets only on a verified Stripe renewal invoice.
- **Prepaid email credits:** separately purchased email quantities. Credits do not expire. Credit purchases are fulfilled only after Stripe confirms payment.
- **Pay-as-you-go:** uses the existing Aurelink USD wallet and active `email_message` / `smtp_message` price-catalog entry. Missing pricing or insufficient balance blocks the send.

For a paid subscription, the monthly allowance is consumed first. Prepaid fallback is opt-in per subscription. Without a paid subscription, Free mode consumes its daily allowance first, then prepaid credits; Pay-as-you-go mode consumes prepaid credits first and then the USD wallet.

### Initial configurable catalogue

The schema seeds these exact starting configurations:

| Plan | Allowance | Monthly price |
|---|---:|---:|
| Starter | 7,000 | $5 |
| Standard | 21,000 | $20 |
| Individual Max | 150,000 | $490 |
| Business | 600,000 | $1,010 |

The plan catalogue defines allowed ranges. Administrators create additional exact allowance/price options inside those ranges; customers never buy a broad range at one fixed price. Enterprise options are administrator-configured at 1 million or more. Prices are USD cents in the database.

Initial prepaid credit packs are 1,000/$1.50, 10,000/$13, 50,000/$55, 100,000/$100, 250,000/$225 and 500,000/$425. Administrators can add or disable packs.

### Enforcement and financial state

Every email send, whether REST API or SMTP, reserves usage inside a database transaction before calling the upstream provider. The reservation records its source: Free daily allowance, monthly subscription, prepaid credits or USD wallet.

- Confirmed provider acceptance captures the reservation.
- Confirmed provider rejection releases the reservation or refunds prepaid/wallet value.
- Timeout, connection loss after submission, or another ambiguous outcome is marked `unknown`; Aurelink does not automatically retry or refund it.
- An administrator must reconcile an unknown outcome with provider evidence.
- Idempotency is enforced for REST requests. SMTP requires a stable `Message-ID`; an already accepted or unknown Message-ID is not submitted again.
- Stripe webhooks are signature-verified and idempotent. Subscription renewals, failed invoices, cancellations and credit purchases are reflected only after server-side provider verification.
- Direct Resend SMTP credentials are disabled. Customer SMTP traffic must pass through the Aurelink-owned gateway so metering cannot be bypassed.

The email-credit ledger is append-only. Wallet balances and subscription usage are updated transactionally, with unique references and row locks to prevent duplicate credits, double spending and concurrent overrun.

### Billing API

- `GET /aurelink/communications/email/billing/plans`
- `GET /aurelink/communications/email/billing/credit-packs`
- `GET /aurelink/communications/email/billing/overview`
- `POST /aurelink/communications/email/billing/checkout`
- `GET /aurelink/communications/email/billing/verify/:reference`
- `PATCH /aurelink/communications/email/billing/mode` — Free or Pay-as-you-go when no active subscription exists
- `PATCH /aurelink/communications/email/billing/prepaid-fallback`
- `POST /aurelink/communications/email/billing/cancel` — schedules Stripe cancellation at period end
- `GET /aurelink/admin/communications/email/smtp/manual-review`
- `POST /aurelink/admin/communications/email/smtp/:id/reconcile`

Pricing-option, credit-pack and reconciliation administration is restricted to `AURELINK_ADMIN_USER_IDS`. Workspace billing actions require owner, administrator or billing role.

### Required configuration

Set `AURELINK_EMAIL_BILLING_SUCCESS_URL` and `AURELINK_EMAIL_BILLING_CANCEL_URL` to the Aurelink application return URLs before enabling Stripe email checkout. Stripe must send signed events to `/payments/stripe/webhook` (or the corresponding `/redom-backend/payments/stripe/webhook` deployment path), including Checkout Session, Invoice and Subscription lifecycle events. The webhook signing secret must be configured through the existing Stripe environment configuration.

These schema and service changes are additive. They do not change SMS billing, SMS provider routing, inbound mail, MX hosting, mailboxes, IMAP or POP3.

SMTP accounting is recipient-based. When the provider accepts only part of a multi-recipient SMTP submission, Aurelink captures usage for accepted recipients and releases/refunds rejected recipients. Each SMTP transaction requires a stable RFC `Message-ID`; Aurelink claims it atomically before upstream submission, so concurrent retries cannot create duplicate sends. Resend delivery webhooks correlate SMTP messages using that client Message-ID and then attach the provider email ID.

If the gateway stops after reserving usage but before recording a final result, stale pending SMTP reservations are moved into manual review rather than automatically resent or refunded. An unknown outcome remains reserved until an administrator reconciles it.

Resend webhook verification uses the provider's Svix signature headers and the raw request body. Configure `AURELINK_RESEND_WEBHOOK_SECRET` with the Resend webhook signing secret. Events that arrive before the SMTP/API submission row is committed remain unprocessed and return a retryable response; they are not permanently marked handled before message correlation succeeds.


### Mail billing enforcement hardening

New Aurelink workspaces default to the published Free billing mode; existing workspaces retain their explicitly stored billing choice. Both the REST billing service and standalone SMTP gateway use the same fail-closed default. A past-due subscription or an active subscription outside its verified Stripe billing period cannot consume the monthly allowance. Sending can continue from prepaid credits only when the customer explicitly enabled prepaid fallback. SMTP reconciliation also preserves the actual upstream provider identity instead of assuming every SMTP message belongs to Resend.


### Updated individual prepaid Mail catalogue and restrictions

The active prepaid catalogue is limited to 1,000, 5,000, 10,000, 50,000, 100,000 and 250,000 credits at $3.50, $8.00, $13.00, $48.00, $85.00 and $190.00 respectively. Packs above 250,000 are disabled. The cumulative workspace prepaid balance is capped at 250,000 credits.

Prepaid sending is restricted to transactional email and 2,500 accepted/reserved email units per workspace per database day. The daily counter is reserved before upstream submission and captured or released/refunded with the message outcome. Subscription allowances remain the preferred source when the paid period is active. Prepaid can cover a subscription shortfall or standalone low-volume use; it does not grant campaign/high-volume or enterprise capabilities. Credits do not expire.

These are proposed retail prices. Before release, verify per-destination Brevo/Resend cost, payment fees, taxes and FX impact to confirm margin.

## Aurelink Mail subscription and prepaid payment providers

New Mail purchases use provider routing from the verified Aurelink account country. Checkout billing-country fields are not a routing override:

- Verified account country `NG` or `GH`: Paystack.
- Any other verified account country: PayPal.
- Missing/unverified account country: checkout is blocked until Aurelink completes country verification.
- Stripe is retained only to verify/cancel legacy Stripe Mail payments and subscriptions; it is not selected for new purchases.

Mail checkout endpoints:

- `POST /aurelink/communications/email/billing/checkout` — creates a PayPal or Paystack hosted checkout.
- `GET /aurelink/communications/email/billing/verify/:reference` — server-side provider verification and fulfillment.
- `POST /aurelink/communications/email/billing/cancel` — cancels a supported PayPal/Paystack recurring subscription.
- `POST /aurelink/webhooks/paypal-mail` — PayPal signed webhook receiver.
- `POST /aurelink/webhooks/paystack-mail` — Paystack HMAC-SHA512 webhook receiver.
- `POST /aurelink/admin/accounts/:userId/verify-country` — administrator-only account-country verification after evidence review.

Required environment:

- `PAYPAL_ENV=sandbox|live`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`.
- `PAYSTACK_SECRET_KEY` and `AURELINK_PAYMENT_ENCRYPTION_KEY` (32 random bytes, base64 or 64-character hex) for AES-256-GCM encryption of Paystack subscription cancellation tokens.
- Prepaid credit checkout obtains a USD-base reference FX quote from `https://open.er-api.com/v6/latest/USD` and resolves the selected two-letter pricing country to its ISO currency using the REST Countries country-currency catalogue. The rate's source timestamp and next-update timestamp are checked; quotes older than 36 hours, unsupported currencies, failed lookups and invalid amounts block checkout. No environment-supplied or hardcoded FX fallback is permitted. The quote, selected country, currency, rate, source and timestamps are snapshotted against the payment before the first payment email is sent. ExchangeRate-API attribution is included in the confirmation email.
- `AURELINK_EMAIL_BILLING_SUCCESS_URL` and `AURELINK_EMAIL_BILLING_CANCEL_URL`.

PayPal creates and caches provider products/plans for recurring Mail options. Paystack creates and caches local-currency recurring plans. Payment fulfillment is performed only after provider verification or a verified webhook, and payment webhook IDs are persisted for deduplication. A provider payment event is not treated as proof solely because a browser returns to Aurelink.

Before production enablement, configure the provider webhook URLs in both dashboards, register the exact webhook IDs/secrets, set finance-approved NGN/GHS rates, and complete a sandbox-to-live end-to-end test for one prepaid purchase and one recurring subscription per provider. The current account-country verification route is an administrator workflow; it must only be used after reviewing acceptable country evidence. No automatic country inference from IP or checkout selection is trusted for routing.


## Aurelink Mail prepaid credit email checkout

Prepaid email-credit purchases use a separate email-authorized checkout flow; they do not return a provider checkout URL to the authenticated application. Aurelink records the Aurelink user/workspace, account ID, verified account country, exact credit pack, USD catalogue amount, provider amount/currency and provider selected from the verified account country. NG/GH route to Paystack; all other verified countries route to PayPal.

Aurelink generates a cryptographically random 256-bit URL token, stores only its SHA-256 hash, and emails a payment link using Resend. The link expires after one hour and can initialize a provider checkout once. A GET request only renders a minimal, self-hosted confirmation page; it does not consume the token, so email security scanners and link-preview bots cannot burn the payment link. Only an explicit POST from the customer atomically consumes the token before creating the PayPal order or Paystack transaction. The payment URL uses HTTPS, no-store/no-referrer/noindex headers and a restrictive Content Security Policy; the token is redacted from request logs. The provider checkout URL is accepted only over HTTPS from the provider's approved checkout hosts. The package, amount, currency, pricing country and destination Aurelink account are never accepted from the browser after the purchase request has been created.

The one-hour expiry applies to starting checkout, not payment reconciliation. Once a provider checkout has been created, a valid provider webhook may settle the purchase after the email token expires. Aurelink verifies the provider signature, exact stored amount/currency/reference and purchase status before atomically crediting the wallet and writing its immutable ledger entry. Pending, failed, rejected or unverified payments never issue credits. Duplicate webhook deliveries are deduplicated; unprocessed events can be retried.

Customer flow:
1. An authenticated workspace billing manager selects a prepaid credit pack and a pricing country. The verified Aurelink account country remains authoritative for provider routing (NG/GH to Paystack; all other verified countries to PayPal); the selected pricing country determines the currency quote. A mismatch that the routed provider cannot settle is rejected rather than silently converted to a different currency.
2. Aurelink resolves the selected country's currency, obtains and validates the latest available USD-base FX quote, snapshots the exact rate/amount/source/timestamps and emails the verified account address an itemized purchase containing account ID, verified account country, pricing country, exact package, amount, currency, provider, FX details, purchase reference and one-hour link.
3. The customer opens the link (GET only displays a confirmation page), explicitly presses Continue (POST consumes the token once), and completes payment on PayPal or Paystack.
4. The provider sends its server-to-server event to Aurelink; Aurelink verifies signature, reference, amount and currency before atomically updating the wallet, writing the immutable ledger entry, marking payment paid and inserting a confirmation-email outbox record.
5. Only after that database transaction commits does the outbox worker send the payment-success/credits-added email. Failed email delivery is retried with bounded exponential backoff; it never rolls back the credit or credits the wallet again. The receipt includes provider, transaction reference, FX quote, package, amount, previous and new wallet balances, ledger reference, and separate successful payment and credit-fulfillment statuses.

Configuration required: `AURELINK_API_URL` (HTTPS public API base, including any backend mount prefix), `RESEND_API_KEY`, and `AURELINK_MAIL_BILLING_FROM` (or existing `AURELINK_RECEIPT_FROM`). Existing PayPal/Paystack credentials, approved NGN/GHS FX rates, and provider webhook configuration remain required. No raw token is stored. The token hash and expiry/consumption timestamps are retained on the payment record for audit.
