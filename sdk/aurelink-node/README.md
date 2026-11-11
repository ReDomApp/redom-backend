# @aurelink/node

Official Node.js SDK for the Aurelink public API. The SDK is optional; the same API works with plain HTTPS requests from any language.

## Install

\`\`\`bash
npm install ./sdk/aurelink-node
\`\`\`

## Create a client

\`\`\`js
import { Aurelink } from "@aurelink/node";
const aurelink = new Aurelink({ apiKey: process.env.AURELINK_API_KEY });
const services = await aurelink.services.list();
console.log(services);
\`\`\`

## Test and live keys

Create a test key in the Aurelink Developer workspace first. Test keys run against Aurelink's isolated sandbox and never call number providers or debit a wallet. Live keys access real services and billing.

Keep keys on a trusted server. Never expose them in browser JavaScript, mobile applications or public repositories.

## Activation example

\`\`\`js
import { randomUUID } from "node:crypto";
const quote = await aurelink.activations.quote({ service: "telegram", country: "US" });
const activation = await aurelink.activations.create({ quoteId: quote.quote?.id }, { idempotencyKey: randomUUID() });
const messages = await aurelink.activations.messages(activation.order?.id);
\`\`\`

The request helper forwards an Idempotency-Key header. Live purchase endpoints require it. Use a unique key for each intended purchase and reuse it only when retrying that same request.

## Other resources

- aurelink.rentals — list, quote, create, retrieve, read messages, renew and cancel.
- aurelink.nonVoip — country/product catalog, order, messages and cancellation.
- aurelink.dedicated — country catalog, quote, order, messages, auto-renew and cancellation.
- aurelink.orders — list orders.
- aurelink.wallet — retrieve wallet and ledger.
- aurelink.request(method, path, options) — call any documented route.

## Communications APIs

Use the same Aurelink API key when it has the relevant permissions: `communications:read`, `communications:send`, and/or `verify:write`.

```js
const overview = await aurelink.communications.overview();

const sms = await aurelink.communications.sms.send({
  recipient: "+14155550123",
  sender: "AURELINK",
  countryCode: "US",
  content: "Your order has shipped.",
  category: "transactional",
  provider: "brevo"
});

const email = await aurelink.communications.email.send({
  recipient: "customer@example.com",
  sender: "notifications@example.com",
  senderName: "Aurelink",
  subject: "Order update",
  text: "Your order has shipped.",
  provider: "resend"
});

const verification = await aurelink.verify.start({
  destination: "+14155550123",
  channel: "sms",
  purpose: "signup",
  sender: "AURELINK",
  countryCode: "US"
});
const result = await aurelink.verify.check(verification.verificationId, "123456");
```

Message sends are asynchronous and require an idempotency key:

```js
import { randomUUID } from "node:crypto";
const queued = await aurelink.communications.sms.send({
  recipient: "+14155550123",
  sender: "AURELINK",
  content: "Your order has shipped.",
  category: "transactional",
  provider: "brevo"
}, { idempotencyKey: randomUUID() });

console.log(queued.message.status); // queued
```

Use the same idempotency key only when retrying the same send. Poll the message through your integration's message reporting or consume delivery webhooks for the final provider status.

Campaigns are available through `aurelink.communications.campaigns`:

```js
const campaign = await aurelink.communications.campaigns.create({
  channel: "email",
  name: "Product update",
  subject: "Aurelink product update",
  text: "We have shipped new developer API capabilities."
});
const started = await aurelink.communications.campaigns.send(campaign.campaign.id, {
  sender: "updates@example.com",
  senderName: "Aurelink",
  provider: "resend"
});
```

Campaigns include only contacts with recorded opt-in consent. SMS campaigns additionally require an HTTPS `webUrl` for opt-out/event handling.

The current adapters support Brevo transactional SMS, Twilio Programmable Messaging, Resend Email API and Brevo transactional Email API. Use `aurelink.communications.domains` to create and verify provider domains, inspect DNS and connect Cloudflare for safe record creation. Use `aurelink.communications.senders` to request country-specific SMS sender IDs; a request is not an approval. Use `aurelink.communications.smtp.credentials` to create, list, rotate and revoke Aurelink SMTP credentials. SMTP connection details are mode-dependent. While `AURELINK_SMTP_TEMPORARY_DIRECT_RESEND=true`, customers temporarily connect to `smtp.resend.com` with username `resend` and a domain-scoped Resend sending key shown once as the password. This is the intentional temporary bridge and bypasses Aurelink's own TCP gateway. Once the Aurelink gateway is deployed and verified, turn the flag off and issue new credentials for `smtp.aurelink.org` (username `aurelink`). The gateway then authenticates Aurelink credentials and forwards through its internal provider key. Provider acceptance is not proof of inbox delivery; delivery status requires authenticated provider webhooks.

## Webhook signature verification

Configure the signing secret shown once when you create an endpoint. Verify the raw request body before parsing it.

\`\`\`js
import { verifyAurelinkWebhook } from "@aurelink/node";
const valid = verifyAurelinkWebhook({
  payload: rawBody,
  signature: request.headers["aurelink-signature"],
  timestamp: request.headers["aurelink-timestamp"],
  secret: process.env.AURELINK_WEBHOOK_SECRET
});
if (!valid) throw new Error("Invalid Aurelink webhook signature");
\`\`\`

Aurelink signs timestamp + "." + rawBody with HMAC-SHA256 and sends Aurelink-Signature: v1=<hex>. Reject timestamps outside the five-minute tolerance and make event processing idempotent using the event id.

## Errors

AurelinkError includes status, code, requestId and details. Rate limit responses use HTTP 429 and include Retry-After. Do not automatically retry a purchase unless you reuse the same idempotency key.

## Package publication

The SDK source is maintained in this repository under `sdk/aurelink-node`. It is not yet published to the public npm registry; install it from a local repository checkout until the npm publisher account is configured.

## API base URL

Default: https://redom-backend.onrender.com/redom-backend/v1

Supply baseUrl when creating the client to target a configured Aurelink API host.

## Billing, reputation and workspace teams

Aurelink communications use a shared usage price catalogue. SMS is metered per SMS segment and destination country; REST email is metered per accepted message; the Aurelink SMTP gateway is metered per accepted recipient message. An active price must be configured before a billable send can be queued. The current implementation uses the prepaid Aurelink wallet and records reservations, captures and refunds in the communications billing ledger.

- `aurelink.communications.billing.overview()` — wallet and recent usage summary.
- `aurelink.communications.billing.usage({ limit })` — detailed usage rows.
- `aurelink.communications.billing.statement("YYYY-MM")` — monthly usage statement (not a tax invoice).
- `aurelink.communications.reputation.retrieve()` — rolling domain scores and alerts.
- `aurelink.communications.team.invite({ email, role })` — create a seven-day invitation token.
- `aurelink.communications.team.acceptInvitation(token)` — accept an invitation using the invited verified Aurelink account.
- `aurelink.communications.domains.suspend(id, reason)`, `resume(id)`, and `remove(id)` — manage sending-domain lifecycle.
- `aurelink.communications.domains.setTrackingDomain(id, "links.example.com")` and `verifyTrackingDomain(id)` — configure and verify a Resend custom tracking subdomain.

Set `workspaceId` in the client options, or pass the `X-Aurelink-Workspace-Id` request header, when working in a workspace shared with your team. Invitations return a token once; deliver it to the invited email address through your configured email channel.
