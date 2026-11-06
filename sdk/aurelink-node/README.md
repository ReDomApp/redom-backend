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
