# @aurelink/node

Official Node.js SDK for the Aurelink HTTP API. Node.js 20+ is required; no runtime dependency is required.

## Install

From a local checkout:

```bash
npm install ./artifacts/aurelink-new/sdk/aurelink-node
```

The package is prepared for npm publication as `@aurelink/node`; publishing it is a separate release action and requires the Aurelink npm publisher account.

## Configure

Keep live API keys in server-side environment variables. Never expose them in browser code, mobile bundles or public repositories.

```js
import { Aurelink } from "@aurelink/node";

const aurelink = new Aurelink({
  apiKey: process.env.AURELINK_API_KEY
});
const services = await aurelink.services.list();
console.log(services);
```

The default API base is `https://redom-backend.onrender.com/redom-backend/v1`. Override `baseUrl` for an approved gateway or test server.

## Test and live environments

Create a test key in Aurelink Developers to receive deterministic sandbox responses without ordering or charging a real number. Create a live key only when ready to access real inventory and wallet-funded operations.

## Create an activation

```js
const quote = await aurelink.quotes.create({
  service: "telegram",
  country: "US"
});

// Use a stable key for retries of the same purchase operation.
const activation = await aurelink.activations.create(
  { quoteId: quote.quote.id },
  { idempotencyKey: "order-2026-000001" }
);
const messages = await aurelink.activations.messages(activation.order.id);
```

The exact quote and order fields depend on the Aurelink catalogue response. Pass the fields returned by the live quote/catalog endpoints.

## Other operations

```js
await aurelink.rentals.catalog({ countryCode: "US" });
await aurelink.rentals.quote({ countryCode: "US", service: "telegram" });
await aurelink.rentals.create({ quoteId: "quote-id" }, { idempotencyKey: "rental-0001" });
await aurelink.dedicated.countries();
await aurelink.dedicated.quote({ countryCode: "US", lineType: "mobile" });
await aurelink.wallet.get();
await aurelink.wallet.ledger();
await aurelink.orders.list();
```

The SDK also exposes `nonVoip`, `activations.get/cancel/resend`, `rentals.get/messages/renew/cancel`, and `dedicated.create/messages/setAutoRenew/cancel`.

## Errors and limits

Requests throw `AurelinkError` with `status`, `code`, `requestId`, `retryAfter`, `idempotencyKey`, and the parsed response `body`. Respect `Retry-After` on HTTP 429. The SDK does not automatically retry purchase requests. Reuse the same idempotency key when safely retrying a live purchase after a network failure.

## Plain HTTP is always supported

The SDK is optional. Any HTTP client can call the same versioned endpoints using `Authorization: Bearer YOUR_AURELINK_API_KEY`.
