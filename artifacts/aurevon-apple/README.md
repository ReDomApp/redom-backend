# AUREVON APPLE — Gift Card Platform

This package implements the first-party gift-card domain for the AUREVON platform: secure code issuance, hashed-code storage, balance checks, partial redemption, full redemption, and voiding. Codes are issued by AUREVON and redeemable only in a merchant system that trusts AUREVON's own ledger. They are not Apple-issued codes and will not redeem in Apple's systems.

## Implemented in this commit

- Cryptographically random first-party code generation using Node.js `crypto.randomBytes`.
- SHA-256 hash storage for codes; raw codes are returned only at issuance.
- Currency and amount validation using integer minor units.
- Optional expiry metadata.
- Balance lookup by code hash.
- Partial and full redemption through a repository contract.
- Conditional atomic-redemption contract to prevent double-spend races.
- Void operation.
- Unit tests for issuance, balance, redemption, invalid amounts, and unknown codes.

## Required before production

1. Implement `GiftCardRepository` against PostgreSQL with unique `code_hash`, transactions, and conditional atomic balance updates.
2. Add authenticated admin endpoints for issue/void and rate-limited customer balance/redeem endpoints.
3. Add authorization checks so redemption is accepted only for an approved AUREVON merchant/order.
4. Add immutable audit events for issuance, redemption, void, refunds, and administrative actions.
5. Integrate a payment provider and issue cards only after confirmed payment or authorized admin approval.
6. Add idempotency keys for purchase and redemption, fraud controls, rate limits, monitoring, and alerts.
7. Encrypt any sensitive delivery payloads, redact codes from logs, and use a secure one-time delivery channel.
8. Define currency, expiry, refunds, chargebacks, lost-card handling, customer support, tax, and stored-value compliance requirements for each launch jurisdiction.
9. Complete security review and end-to-end tests against a real transactional database before enabling sales.

## Product boundary

This implementation does not imitate Apple's code format or generate codes for Apple's redemption system. AUREVON-issued cards have value only under AUREVON's own published terms and merchant acceptance. Any Apple-branded resale or Apple gift-card fulfillment must use genuine issuer-authorized inventory and must not be represented as Apple-approved without documented authorization.

## Integration

Import `GiftCardService` and provide a persistent implementation of `GiftCardRepository`. All monetary amounts are integer minor units (for example, 1050 means $10.50 in a currency with two decimal places). The repository's `redeemAtomic` operation must be a single database transaction or conditional update that fails if the record is not active or its balance is insufficient.
