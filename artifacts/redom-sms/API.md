# ReDom SMS API

Base path: /v1

Authentication: Authorization: Bearer <SMS_API_KEY>

## Send
POST /messages
{
  "to": "+15551234567",
  "from": "ReDom",
  "text": "Hello",
  "clientReference": "order-123",
  "scheduledAt": "2026-10-08T12:00:00.000Z",
  "ttlSeconds": 3600
}

## Batch
POST /messages/batch with { "messages": [ ... ] }. Up to 100 messages.

## Inspect
GET /messages
GET /messages/:id

## Cancel
POST /messages/:id/cancel

Only queued/scheduled messages are cancellable. Once a carrier has accepted a message, cancellation is not guaranteed by SMS networks.

## Webhooks
POST /webhooks
GET /webhooks
DELETE /webhooks/:id

Events include message.queued, message.submitted, message.delivered, message.failed, message.expired, message.cancelled, message.received and message.opted_out.

Webhook requests carry X-ReDom-Signature, an HMAC-SHA256 signature of the exact request body using the webhook secret.

## Inbound
POST /inbound

This endpoint is intended for an authenticated SMSC/carrier gateway. It requires X-SMSC-Secret and accepts E.164 from/to and text.

Direct SMPP connections can deliver mobile-originated SMS directly into the same message lifecycle.

## Opt-out
POST /optouts
DELETE /optouts/:phone

STOP, UNSUBSCRIBE, CANCEL, END and QUIT received from a subscriber automatically add the subscriber to the opt-out table.

The send API rejects opted-out recipients unless skipOptOutCheck is explicitly used by an authorized compliance workflow.

## Network capabilities

Implemented in this service:
- MT SMS
- MO SMS
- GSM-7
- UCS-2
- concatenated/multipart SMS
- delivery receipts
- retries
- TTL/expiry
- scheduled sending
- cancellation before carrier submission
- batch sending
- idempotency
- webhook events
- opt-out state
- direct SMPP transport
- PostgreSQL durable queue

Not supplied by software alone:
- mobile-network connectivity
- phone-number inventory/provisioning
- sender registration
- A2P registration/carrier approval
- country-specific regulatory registration
- direct carrier contracts

Those require the appropriate carrier/SMSC interconnect and legal registrations. The service deliberately does not fake those capabilities.