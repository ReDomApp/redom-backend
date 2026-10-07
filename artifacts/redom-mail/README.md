# ReDom Mail

ReDom Mail is ReDom's first-party transactional email delivery engine. The current sending identity is wnncompany.com and the architecture is designed to migrate to ReDom's future domain without replacing the delivery layer.

## What it owns
- Authenticated HTTPS email API
- Durable PostgreSQL delivery queue
- Direct SMTP delivery to recipient MX hosts
- STARTTLS when offered
- DKIM RSA-SHA256 signing
- Sender-domain enforcement
- Retry and backoff
- Delivery state in PostgreSQL
- Health and domain-configuration endpoints

It does not call Resend, SendGrid, Mailgun, SES, or another email API.

## Production architecture
Use two roles:
1. API — public HTTPS endpoint.
2. SMTP worker — outbound delivery process on infrastructure with a stable public IP and reverse-DNS/PTR control.

The worker connects directly to recipient MX servers on TCP/25. The API returns queued only after the message is persisted.

## API
POST /v1/emails

Authorization: Bearer <MAIL_API_KEY>

Example request:
~~~json
{
  "from": "ReDom <no-reply@wnncompany.com>",
  "to": ["recipient@example.com"],
  "subject": "Welcome to ReDom",
  "text": "Welcome to ReDom.",
  "html": "<h1>Welcome to ReDom.</h1>"
}
~~~

Example response:
~~~json
{
  "id": "rm_...",
  "object": "email",
  "status": "queued"
}
~~~

## DNS plan for wnncompany.com
Do not replace an existing SPF record. Merge this service into the existing policy if WNN Company already sends mail.

### Sending host
~~~text
mail.wnncompany.com. A <DEDICATED_SMTP_PUBLIC_IP>
<DEDICATED_SMTP_PUBLIC_IP> PTR mail.wnncompany.com.
~~~

The PTR hostname must resolve forward to the same sending IP.

### SPF
If this is the only sender:
~~~text
wnncompany.com. TXT "v=spf1 ip4:<DEDICATED_SMTP_PUBLIC_IP> -all"
~~~

### DKIM
Selector: mail2026
~~~text
mail2026._domainkey.wnncompany.com. TXT "v=DKIM1; k=rsa; p=<PUBLIC_KEY>"
~~~

Never commit the private DKIM key.

### DMARC
Start with monitoring:
~~~text
_dmarc.wnncompany.com. TXT "v=DMARC1; p=none; rua=mailto:dmarc@wnncompany.com; adkim=s; aspf=s; pct=100"
~~~

After authentication and reputation are established, the policy can be tightened.

### API DNS
Use api.mail.wnncompany.com for the HTTPS API and point it to the selected HTTPS service using that platform's custom-domain configuration.

## DKIM key generation
On the SMTP worker host:
~~~bash
openssl genrsa -out wnncompany-dkim.pem 2048
openssl rsa -in wnncompany-dkim.pem -pubout -outform PEM -out wnncompany-dkim-public.pem
~~~

Store the private key as a deployment secret/file. Do not commit it to GitHub.

## Environment
~~~text
DATABASE_URL=...
MAIL_API_KEY=...
MAIL_ROLE=api
SMTP_HOSTNAME=mail.wnncompany.com
SMTP_HELO_NAME=mail.wnncompany.com
SMTP_FROM_DOMAIN=wnncompany.com
DKIM_SELECTOR=mail2026
DKIM_PRIVATE_KEY_PATH=/run/secrets/wnncompany-dkim.pem
REQUIRE_DKIM=true
~~~

For the direct SMTP worker use MAIL_ROLE=worker. For development, MAIL_ROLE=all.

## Security
- Never accept arbitrary From domains.
- Never expose the SMTP worker as an unauthenticated submission server.
- Never commit API keys or DKIM private keys.
- Keep API keys and private keys in deployment secrets.
- Add bounce, complaint and suppression handling before marketing traffic.
- Do not use the service for unsolicited bulk email.
- Keep transactional and promotional traffic separated when volume warrants it.

## Initial scope
This first version is intentionally focused on transactional ReDom mail: verification, password resets, security alerts, payment receipts, refund notifications and account notifications.

Future control-plane work can add templates, event webhooks, bounce ingestion, complaint processing, suppression lists, per-project API keys, usage metrics and a delivery dashboard.

## Deployment
The API can run on existing ReDom infrastructure. The SMTP worker should use a dedicated VM/VPS with a stable public IPv4 and provider-controlled PTR. Neon can provide the PostgreSQL database already used by ReDom.


## Current API capabilities

### Outbound
- `POST /v1/emails` with text/HTML, CC/BCC, Reply-To, custom headers, tags and attachments.
- Base64, local-file and HTTPS URL attachments.
- `Idempotency-Key` support.
- `POST /v1/emails/batch` for up to 100 messages.
- Scheduled delivery through the durable PostgreSQL job queue.
- `GET /v1/emails`, `GET /v1/emails/:id`, and attachment retrieval.
- Lifecycle events for sent, scheduled, delivered, delayed/retried, bounced, failed, opened and clicked messages.\n- Optional HTML open-pixel and click-through tracking through `TRACKING_BASE_URL`.

Resend documents the same core capabilities including attachments, scheduling, batches and idempotency. Resend specifically does not allow attachments on scheduled messages; this implementation can enforce that restriction before production if exact API compatibility is required. citeturn1search0turn1search11

### Inbound
The SMTP worker accepts mail addressed to `@wnncompany.com`, parses MIME text/HTML and attachments, stores the message and attachment bytes in PostgreSQL, and emits `email.received`.

Use:

- `GET /v1/received`
- `GET /v1/received/:id`
- `GET /v1/emails/:id/attachments`
- `GET /v1/attachments/:id`

Resend's inbound system likewise persists received mail, exposes received-message and attachment access, and sends an `email.received` webhook. citeturn0search0turn0search2

### Webhooks
- Create/list/disable webhook endpoints.
- HMAC-signed webhook payloads.
- Durable webhook delivery queue.
- Exponential retry.
- Manual replay.
- Event persistence.

The implementation is designed around the same reliability model Resend documents for webhook retries and manual replays. citeturn1search4

## Receiving mail in production

Receiving is **not enabled merely by deploying the API**.

For `support@wnncompany.com`, `no-reply@wnncompany.com`, etc.:

1. Give the SMTP worker a stable public IP.
2. Point `mail.wnncompany.com` to that IP.
3. Configure the IP's PTR/reverse DNS to `mail.wnncompany.com`.
4. Publish an MX record for `wnncompany.com` pointing to `mail.wnncompany.com`.
5. Allow inbound TCP/25 through the VPS/firewall/load-balancer path.
6. Run the inbound SMTP role with `INBOUND_SMTP_ENABLED=true`.
7. Set `INBOUND_SMTP_PORT=25` when the process itself owns port 25, or keep 2525 and forward TCP/25 to it.
8. Test from an external mailbox before considering inbound production-ready.

Example MX:

~~~text
wnncompany.com. MX 10 mail.wnncompany.com.
~~~

Do not publish the MX until the receiving host is actually reachable.

## Important production boundary

GitHub CI proves that the ReDom Mail code type-checks and builds. It cannot prove external SMTP delivery or inbound reception because those require a real public IP, DNS, PTR, firewall rules, DKIM private key and live recipient MX servers.

Therefore:

**Code readiness: READY**

**Real-world send readiness: requires SMTP host + public IP/PTR + SPF/DKIM/DMARC + port 25 egress**

**Real-world receive readiness: requires MX + public IP/PTR + port 25 ingress + inbound worker**

Do not mark the service as fully live until those infrastructure checks pass.
