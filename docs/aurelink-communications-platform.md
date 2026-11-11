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

Sender ID applications are fail-closed. A customer must first register a public HTTPS business website in Aurelink Developer and prove domain control using a DNS TXT challenge at `_aurelink-verification.<domain>`. A URL typed into a form is not treated as a verified website.

Before an application can enter provider submission, it must include the registered legal business name, business address, business contact name/email/phone, destination country, Sender ID, SMS purpose, use-case description, actual sample message, estimated monthly volume, Privacy Policy URL and Terms and Conditions URL hosted on the verified business domain or its subdomain, an HTTPS recipient opt-in evidence reference, genuine registration/brand-authorization document references and SHA-256 checksums. The applicant must explicitly attest to document authenticity, brand authorization, recipient consent and policy review.

Aurelink security administrators must manually complete the security checklist before clearing an application: legal business identity, brand ownership/authorization, document authenticity, website content, the required Privacy Policy non-sharing statement for SMS opt-in data/consent, Terms and Conditions disclosures (business identity, products, message frequency, rates, support contact and STOP instructions), opt-in evidence, use case/sample message and destination-specific carrier requirements. Only then can the registration move to `ready_for_submission`. A checksum detects later file changes; it does not prove that a document is genuine. Automated AI-document detection is not claimed. Suspicious or unverifiable submissions remain blocked for manual review or rejection. When a security administrator marks an application as a security failure, they must choose a restriction period from 1 to 365 days. The restriction blocks new Sender ID applications and SMS delivery through that workspace until it expires; enforcement checks the expiry on each request and does not depend on a cleanup worker.

Provider submission and provider approval are separate transitions. Submission requires a real provider reference; approval requires a real provider reference and HTTPS evidence of provider/carrier approval. SMS sending additionally requires `status=approved`, `registration_state=approved`, a passed Aurelink security review and a verified website association. An admin cannot bypass the security gate through the review endpoint.

Current endpoints:

- `POST /aurelink/communications/websites` — create a DNS ownership challenge.
- `POST /aurelink/communications/websites/:id/verify` — verify the published TXT challenge.
- `GET /aurelink/communications/websites` — list verified website records.
- `POST /aurelink/communications/senders` — create a complete application; it enters security review and is not submitted to a provider.
- `GET /aurelink/communications/senders` — view applications and approval status.
- `POST /aurelink/communications/senders/:id/review` — administrator-only security clearance, rejection, provider submission or provider approval.

Toll-free registrations are not interchangeable with alphanumeric Sender IDs. US/Canada alphanumeric requests are rejected, and the toll-free workflow remains explicitly blocked until a dedicated number-based registration workflow is implemented. No toll-free request is falsely represented as submitted.

## Aurelink SMS destination coverage and Brevo Sender ID workflow

The supported SMS destination registry currently contains 205 unique country/territory entries and is seeded from `sms-country-registry.ts` into `aurelink_sms_supported_countries`. It includes the product-approved list supplied by Aurelink operations, with ISO alpha-2 identifiers and E.164 international calling prefixes. Singapore (`SG`) is intentionally disabled and excluded. The registry is authoritative for destination eligibility; the presence of a country does not imply that every sender type is permitted there or that Brevo has approved a Sender ID.

Customer API:

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

- `GET /aurelink/admin/communications/sender-submissions` — due and in-progress Brevo requests.
- `POST /aurelink/admin/communications/sender-submissions/:id/reveal-token` — one-time token reveal after the one-hour hold.
- `POST /aurelink/admin/communications/sender-submissions/:id/mark-submitted` — map the actual Brevo reference to the request.
- `POST /aurelink/admin/communications/sender-submissions/:id/reconcile` — record an actual status returned through Brevo's operator workflow.
- `POST /aurelink/webhooks/brevo/sender-registration` — authenticated callback contract for a supported Brevo callback or an Aurelink-controlled integration relay. It requires `AURELINK_BREVO_SENDER_REGISTRATION_WEBHOOK_SECRET`.

Important provider limitation: Brevo's published Sender ID registration instructions currently direct customers to submit through Brevo Console (Settings → Campaigns → SMS Sender ID) and track progress in the Brevo notification center/email. The public Brevo API documentation exposes SMS sending and email sender management, but does not document an API endpoint for creating or submitting SMS Sender ID registration applications, nor a Sender ID registration webhook. Therefore the one-hour scheduler currently creates a secure Aurelink operator submission task; it does not falsely claim an automatic Brevo API submission. A real Brevo registration reference and returned terminal status must be recorded or relayed into Aurelink. The callback endpoint is ready for such a verified relay, but must not be described as a native Brevo webhook until Brevo documents/supports it.

Country-specific Sender ID formats and supporting requirements still apply. Aurelink enforces the baseline 3–11 character alphanumeric format, rejects spaces/special characters, and disallows digits in destinations where Brevo's published rules prohibit them (including Bulgaria, Gambia, Guatemala, Honduras, Liberia, Nicaragua, Nigeria, Pakistan, Romania and Rwanda). US and Canada are represented as supported SMS destinations, but their application path requires a registered +1 toll-free number rather than an alphanumeric sender. The sending adapter validates the same country rules again at send time.

## SDKs

- Node.js SDK: `sdk/aurelink-node`
- Java SDK source: `sdk/aurelink-java`

The Java package is source code in this repository and is not yet published to a Maven repository. SDK publication and release automation are separate from adding the source package.
