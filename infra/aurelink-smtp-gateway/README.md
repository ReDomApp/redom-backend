# Aurelink SMTP Gateway

This service owns the customer-facing SMTP endpoint `smtp.aurelink.org`. It authenticates Aurelink-issued credentials, resolves the account's encrypted Resend sending key from the shared Aurelink PostgreSQL database, and submits each message to Resend over authenticated TLS.

## Customer SMTP settings

- Host: `smtp.aurelink.org`
- Port 465: implicit SSL/TLS
- Port 587: STARTTLS (TLS required)
- Username: `aurelink`
- Password: unique Aurelink-generated credential (not the Resend key)
- Provider label: Aurelink SMTP

## Automatic TLS certificates

The gateway obtains and renews a free Let's Encrypt certificate automatically using HTTP-01 validation. No certificate or private-key upload is required.

- Public TCP port 80 forwards to the gateway's ACME challenge handler on internal port 8081.
- Only `/.well-known/acme-challenge/*` is served on that listener.
- Certificates, ACME account data and renewal metadata live under `/data`.
- A Fly Volume named `aurelink_smtp_data` must be mounted at `/data`.
- The gateway retries initial issuance every 10 minutes until DNS and public HTTP validation work, then checks renewal every 12 hours.
- After a successful renewal, the Machine restarts to load the renewed certificate.

HTTP-01 validation requires `smtp.aurelink.org` to resolve publicly to the Fly app's dedicated IPv4 address and inbound TCP port 80 to reach this app. Let's Encrypt only performs HTTP-01 validation on port 80. Keep the DNS record DNS-only (no HTTP proxy).

## Fly.io deployment

Run from this directory:

```sh
fly auth login
fly apps create aurelink-smtp-gateway
fly volumes create aurelink_smtp_data --region iad --size 1
fly ips allocate-v4
```

If the app already exists, skip `fly apps create`. If the volume or dedicated IPv4 already exists, do not create a duplicate.

Set the following secrets using values from the existing Aurelink backend deployment:

```sh
fly secrets set \
  DATABASE_URL='YOUR_NEON_DATABASE_URL' \
  AURELINK_COMMUNICATIONS_ENCRYPTION_KEY='THE_EXACT_SAME_BACKEND_ENCRYPTION_SECRET'
```

The encryption secret must exactly match the stable secret used by the backend to encrypt stored provider keys. Do not rotate it without re-encrypting existing values. Do not commit or share secrets.

Then deploy:

```sh
fly deploy --config fly.toml
```

After Fly reports the dedicated IPv4 address, create a Namecheap BasicDNS A record:

- Type: A Record
- Host: `smtp`
- Value: the Fly dedicated IPv4
- TTL: Automatic

No root-domain nameserver changes are required. Wait for DNS propagation; the gateway will automatically obtain its certificate. Check:

```sh
fly logs
fly status
```

The health endpoint is `/healthz` on internal port 8080 and reports `smtpReady: false` while waiting for DNS/certificate issuance. SMTP ports 465 and 587 become active after the certificate is issued.

## Runtime environment

Required:
- `DATABASE_URL`: same Aurelink PostgreSQL database used by the backend.
- `AURELINK_COMMUNICATIONS_ENCRYPTION_KEY`: exactly the same stable secret configured on the Aurelink backend (or its supported `JWT_ACCESS_SECRET` fallback).

Optional:
- `SMTP_HOSTNAME` (default `smtp.aurelink.org`)
- `ACME_EMAIL` (Let's Encrypt account notification email; optional)
- `ACME_DATA_DIR` (default `/data`)
- `ACME_HTTP_PORT` (default `8081`)
- `ACME_RETRY_INTERVAL_MS` (default `600000`)
- `ACME_RENEW_INTERVAL_MS` (default `43200000`)
- `SMTP_PORT_SSL` (465), `SMTP_PORT_STARTTLS` (587), `HEALTH_PORT` (8080)
- `SMTP_MAX_CLIENTS` (200), `SMTP_MAX_MESSAGE_BYTES` (15728640), `DATABASE_POOL_MAX` (12)

## Message handling

The gateway accepts SMTP AUTH LOGIN/PLAIN only over TLS. The username must be `aurelink`; the password uniquely identifies one active Aurelink credential. It checks that the credential's domain remains verified, validates envelope and header From addresses against that domain, and forwards using the associated Resend key (username `resend`) to `smtp.resend.com:587` with STARTTLS required. A revoked credential or unverified domain cannot authenticate.

Keep health port 8080 private. Do not commit certificates, keys, database URLs, or provider credentials.
