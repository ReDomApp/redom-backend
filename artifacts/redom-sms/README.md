# ReDom SMS

ReDom-owned SMS infrastructure layer.

## Non-negotiable architecture

This service is intentionally independent from `artifacts/redom-backend`. The backend is not modified by this project until the SMS infrastructure has been completed and validated.

`redom-sms` owns the application-level SMS lifecycle: API authentication, E.164 validation, GSM-7/UCS-2 selection, segmentation, idempotency, persistence, queueing, retries, delivery receipts, inbound messages, routing and the carrier/SMSC connection boundary.

Actual delivery to public mobile networks requires lawful telecommunications interconnection. This project does not pretend that an internet server alone can reach every mobile network. Production carrier connectivity is supplied through direct carrier/SMSC interconnects that implement the adapter contract; no consumer SMS API provider is required by the architecture.

## Service boundary

- HTTP API: send, inspect, cancel and receive messages.
- PostgreSQL: durable message state, segments, routes and delivery receipts.
- Queue worker: claims queued messages with PostgreSQL row locks.
- Carrier adapter: direct SMPP/SMSC connection boundary.
- Delivery receipts: mapped to ReDom message and segment IDs.
- Inbound SMS: accepted from an authorized SMSC connection.
- Idempotency: duplicate requests do not create duplicate messages.
- Security: API bearer key, strict input validation, bounded payloads and no secrets in logs.

## Production phases

1. Build and typecheck the software layer.
2. Deploy isolated ReDom SMS infrastructure.
3. Establish ReDom's lawful carrier/SMSC interconnects.
4. Configure one carrier connection and prove MT + DLR + MO.
5. Add additional direct carrier routes and global routing.
6. Only then integrate `artifacts/redom-backend`.

## Development

```bash
pnpm --filter @workspace/redom-sms typecheck
pnpm --filter @workspace/redom-sms build
pnpm --filter @workspace/redom-sms start
```

The service starts without an SMSC connection when `SMSC_ENABLED=false`; messages remain queued rather than being falsely reported as delivered.
