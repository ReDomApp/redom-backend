# ReDom Mail — Environment & Credential Inventory

This document is the source-of-truth checklist for the ReDom Mail runtime configuration on the `feat/redom-mail-engine` branch.

## Important security rule

**Never put real secrets in GitHub source files.**

This inventory records whether a value is defined by the code/configuration and whether it still needs to be supplied to the live deployment. It does **not** contain secret values.

A value marked **configured in code** is not the same as **configured in the live deployment**. Live deployment secrets must be checked in the hosting environment.

## 1. Current ReDom Mail environment

| Variable / resource | Current configured value | Status | Secret? | Action |
|---|---|---|---|---|
| `NODE_ENV` | `development` in `.env.example` | Config template only | No | Set production value in live deployment |
| `MAIL_ROLE` | `all` in `.env.example` | Config template only | No | Production should normally use separate `api` / `worker` roles |
| `PORT` | `8080` | Configured default | No | Keep for HTTPS API process unless host requires another port |
| `DATABASE_URL` | Placeholder only | **NOT configured in GitHub** | **Yes** | Supply the production Neon connection string as a deployment secret |
| `MAIL_API_KEY` | Placeholder only | **NOT configured in GitHub** | **Yes** | Generate a long random API key and store only as a deployment secret |
| `SMTP_HOSTNAME` | `mail.wnncompany.com` | Configured | No | Requires the DNS A record to point to the live SMTP IP |
| `SMTP_HELO_NAME` | `mail.wnncompany.com` | Configured | No | Must match the production mail hostname |
| `SMTP_FROM_DOMAIN` | `wnncompany.com` | Configured | No | Sender domain enforced by ReDom Mail |
| `REQUIRE_DKIM` | `true` | Configured | No | Keep enabled in production |
| `DKIM_SELECTOR` | `mail2026` | Configured | No | Existing selector expected by the mail engine |
| `DKIM_PRIVATE_KEY_PATH` | `/run/secrets/wnncompany-dkim.pem` | Path configured; key not present in GitHub | **Yes** | Generate/provide the production private key on the SMTP worker only |
| `INBOUND_SMTP_ENABLED` | `false` in `.env.example` | **NOT live-enabled** | No | Set `true` on the inbound SMTP worker after TCP/25 is available |
| `INBOUND_SMTP_PORT` | `2525` | Configured development/default | No | Use 25 directly or forward public TCP/25 to 2525 |
| `TRACKING_BASE_URL` | `https://mail.wnncompany.com` | Configured | No | Requires the hostname to resolve to the HTTPS tracking/API service |
| `SMTP_CONNECT_TIMEOUT_MS` | `15000` | Configured | No | Runtime tuning value |
| `SMTP_COMMAND_TIMEOUT_MS` | `15000` | Configured | No | Runtime tuning value |
| `SMTP_MAX_MESSAGE_BYTES` | `10485760` in `.env.example` | Configured template | No | Keep aligned with production policy |
| `SMTP_RETRY_LIMIT` | `4` in `.env.example` | Configured template | No | Runtime tuning value |
| `SMTP_RETRY_BASE_MS` | `5000` | Configured | No | Runtime tuning value |

## 2. Credentials

### Required production secrets

These must exist in the live deployment but must **not** be committed to GitHub:

1. **Neon PostgreSQL connection string**
   - Environment variable: `DATABASE_URL`
   - Source: existing ReDom production Neon database
   - GitHub source status: not configured
   - Store as: deployment secret

2. **ReDom Mail API key**
   - Environment variable: `MAIL_API_KEY`
   - Used by authenticated clients calling `/v1/emails`, `/v1/emails/batch`, webhooks and mail-management endpoints
   - GitHub source status: not configured
   - Store as: deployment secret
   - Generate a new long random value; do not reuse another service's credential.

3. **DKIM private key**
   - File: `/run/secrets/wnncompany-dkim.pem`
   - Selector: `mail2026`
   - Domain: `wnncompany.com`
   - GitHub source status: **never commit**
   - Store as: SMTP-worker secret/file
   - The corresponding public key is published in DNS.

## 3. DNS / Internet mail infrastructure

These are external resources, not GitHub environment variables.

| Resource | Expected configuration | Status |
|---|---|---|
| `mail.wnncompany.com` A | Points to dedicated public SMTP IPv4 | **IP still required** |
| SMTP public IPv4 | Dedicated stable public IPv4 | **NOT configured/identified** |
| PTR / reverse DNS | Public IPv4 → `mail.wnncompany.com` | **NOT configured** |
| MX for `wnncompany.com` | MX 10 → `mail.wnncompany.com` | User reports MX already configured; must still be verified against the final SMTP IP |
| SPF | Existing WNN Company SPF | User reports already configured; must be verified to authorize the final SMTP IP if needed |
| DKIM | Existing WNN Company DKIM | User reports already configured; ReDom selector is `mail2026`; must verify it matches the ReDom signing key |
| DMARC | Existing WNN Company DMARC | User reports already configured |
| TCP/25 inbound | Public Internet → SMTP server | **NOT configured** |
| TCP/25 outbound | SMTP server → recipient MX servers | **NOT verified** |
| TLS certificate | Valid certificate for `mail.wnncompany.com` | **NOT configured in ReDom Mail deployment** |
| Inbound SMTP | ReDom Mail inbound worker | Code exists; **not live-enabled** |
| SMTP worker public host | Stable server with PTR and TCP/25 | **NOT configured** |

## 4. What is already implemented in the ReDom Mail code

The GitHub artifact currently contains:

- Direct outbound SMTP delivery to recipient MX servers
- Opportunistic outbound STARTTLS
- DKIM RSA-SHA256 signing
- Sender-domain enforcement for `@wnncompany.com`
- Durable PostgreSQL queue
- Retry/backoff
- Outbound attachments
- CC/BCC/Reply-To
- Idempotency
- Batch send
- Scheduled send
- Received-mail storage
- Received-mail attachments
- `email.received`
- Webhook storage/delivery/replay
- Open/click tracking
- Message and attachment retrieval APIs
- API authentication
- Health endpoint
- Separate API/worker role support

## 5. What is NOT yet a live credential/configuration

The following cannot be considered live merely because the code exists in GitHub:

- Production `DATABASE_URL` secret
- Production `MAIL_API_KEY` secret
- Production DKIM private key on the SMTP worker
- Dedicated public SMTP IPv4
- PTR/reverse DNS
- TCP/25 inbound
- TCP/25 outbound
- Production TLS certificate deployment
- Inbound worker enabled
- Final verification that the Namecheap MX points to the live SMTP host
- Final SPF verification against the actual SMTP sending IP
- Final DKIM verification against selector `mail2026`

## 6. Production activation order

1. Obtain a server with a stable public IPv4, inbound/outbound TCP/25 and provider-controlled PTR.
2. Set PTR to `mail.wnncompany.com`.
3. Set Namecheap A record `mail → <SMTP_PUBLIC_IP>`.
4. Verify the existing MX record points to `mail.wnncompany.com`.
5. Verify/merge the existing SPF record so the final SMTP IP is authorized.
6. Generate the production DKIM key pair.
7. Publish the `mail2026._domainkey` public key in Namecheap DNS.
8. Confirm the existing DMARC policy.
9. Install the DKIM private key only on the SMTP worker.
10. Install a TLS certificate for `mail.wnncompany.com`.
11. Configure `DATABASE_URL` using the production Neon secret.
12. Generate and configure `MAIL_API_KEY`.
13. Run the ReDom Mail API.
14. Run the ReDom Mail worker.
15. Enable inbound SMTP and expose public TCP/25.
16. Verify external inbound delivery to `support@wnncompany.com`.
17. Verify outbound delivery to independent Gmail/Outlook test accounts.
18. Verify SPF, DKIM, DMARC, PTR and TLS results before declaring Internet mail production-ready.

## 7. Critical distinction

**GitHub source readiness is not Internet mail readiness.**

The repository contains the ReDom Mail software and configuration contract. The live deployment still needs the secrets and public SMTP infrastructure listed above.

Do not put the actual `DATABASE_URL`, `MAIL_API_KEY`, DKIM private key, or any other credential into this file or any Git-tracked source file.
