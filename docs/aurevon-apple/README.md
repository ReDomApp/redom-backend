# AUREVON APPLE — Project Scope

AUREVON APPLE is a proposed independent digital gift-card platform. This repository workstream is limited to a legitimate gift-card distribution and redemption experience.

## Non-negotiable product boundary

- Do not generate, guess, imitate, or derive Apple gift-card redemption codes.
- Do not implement Apple-like code formats, cryptographic recipes, seed words, or algorithms intended to create codes accepted by Apple's systems.
- A code is valid only when issued or recognized by the relevant issuer through an authorized process.
- The platform may support catalog, checkout, order records, customer support, fraud prevention, and fulfillment of gift cards obtained through a documented authorized supply arrangement.
- Do not imply that AUREVON APPLE is owned, endorsed, or authorized by Apple unless a written authorization supports that claim.

## Proposed workstreams

1. **Catalog** — product denominations, region/currency availability, terms, and clear issuer identification.
2. **Checkout** — payment intent, order creation, idempotency, and payment status.
3. **Fulfillment** — delivery of genuine issuer-provided gift cards after confirmed payment and authorized supply.
4. **Compliance and security** — supplier verification, audit logs, fraud controls, privacy, support, and refund/dispute handling.

## Current status

Planning scaffold only. No live gift-card generation, inventory, issuer integration, or payment flow is implemented. Do not store real gift-card codes, payment secrets, or customer personal data in source control.

## Suggested acceptance criteria

- Every sellable card has a documented, verified supply source and region restrictions.
- Orders are fulfilled only after payment is confirmed and inventory/supply is authorized.
- Gift-card secrets are encrypted at rest, excluded from logs, and disclosed only to the entitled purchaser.
- Failed, duplicate, refunded, or disputed orders are handled deterministically and audited.
- Tests cover authorization, idempotency, access control, and error handling.
