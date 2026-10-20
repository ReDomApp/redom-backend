# AUREVON APPLE

A digital gift-card application workstream. The initial implementation provides a provider-neutral foundation for catalog, order, and fulfillment workflows. Issuer-specific production fulfillment remains disabled until a documented, authorized provider integration is configured.

## Scope included in this scaffold

- Gift-card catalog model with currency, region, denomination, and terms metadata.
- Order lifecycle and idempotency requirements.
- Provider adapter contract for authorized inventory/issuance.
- Local mock provider for development and tests only.
- Security, audit, refunds, and support requirements.

## Important issuer boundary

This application must not imitate Apple-issued code formats, derive Apple redemption codes, or claim a code is valid in Apple's systems without an authorized issuer integration. The mock provider is not connected to Apple and must never be used to sell cards or represent real value.

## Suggested integration

Implement this module within the existing backend workspace conventions after inspecting the monorepo package structure. Keep issuer secrets in managed environment secrets; never commit credentials, real gift-card codes, or payment data.

## Lifecycle

`draft -> pending_payment -> paid -> fulfillment_pending -> fulfilled`

Exceptional states: `payment_failed`, `fulfillment_failed`, `cancelled`, `refunded`, `disputed`.

All state changes must be validated server-side and recorded in an audit log. Fulfillment must be idempotent and must not occur until payment is confirmed and an authorized supply source has accepted the order.
