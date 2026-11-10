# Aurelink SMTP Gateway

This service owns the customer-facing SMTP endpoint smtp.aurelink.org. It authenticates Aurelink-issued credentials, resolves the account's encrypted Resend sending key from the shared Aurelink PostgreSQL database, and submits each message to Resend over authenticated TLS.

## Customer SMTP settings

- Host: smtp.aurelink.org
- Port 465: implicit SSL/TLS
- Port 587: STARTTLS (TLS required)
- Username: aurelink
- Password: unique Aurelink-generated credential (not the Resend key)
- Provider label: Aurelink SMTP

## Runtime requirements

Deploy this container on infrastructure that supports public raw TCP ingress on ports 465 and 587. An ordinary HTTP-only web service or HTTP reverse proxy cannot carry SMTP. Point the unproxied DNS record smtp.aurelink.org to the gateway's public IP/address. Do not enable an HTTP/CDN proxy for this hostname.

Required environment:
- DATABASE_URL: same Aurelink PostgreSQL database used by the backend.
- AURELINK_COMMUNICATIONS_ENCRYPTION_KEY: exactly the same stable secret configured on the Aurelink backend. Changing it without re-encrypting stored provider keys will make existing SMTP credentials unusable.
- SMTP_TLS_CERT_PATH and SMTP_TLS_KEY_PATH: paths to the certificate and private key for smtp.aurelink.org, mounted into the container.
- Optional: SMTP_PORT_SSL (465), SMTP_PORT_STARTTLS (587), HEALTH_PORT (8080), SMTP_MAX_CLIENTS (200), SMTP_MAX_MESSAGE_BYTES (15728640), DATABASE_POOL_MAX (12).

The gateway must be given these values at runtime before it can start. Missing `DATABASE_URL`, `SMTP_TLS_CERT_PATH`, `SMTP_TLS_KEY_PATH`, or the shared encryption secret causes startup to fail. The TLS certificate and private key must be mounted into the container; the Docker build intentionally excludes certificate/key files. The gateway uses the shared PostgreSQL aurelink_smtp_credentials and aurelink_email_domains records. Each customer password is bcrypt-hashed; the first 16 characters are a non-secret lookup prefix with a unique database index. The associated Resend key is encrypted at rest with AES-256-GCM and is only decrypted in memory for the outbound session. No provider key or customer password is written to logs.

## Message handling

The gateway accepts SMTP AUTH LOGIN/PLAIN only over TLS. The username must be aurelink; the password uniquely identifies one active Aurelink credential. It checks that the credential's domain remains verified, validates the envelope sender and message From addresses against that domain, and forwards using the associated Resend key (username resend) to smtp.resend.com:587 with STARTTLS required. A revoked credential or unverified domain cannot authenticate.

The health endpoint is HTTP /healthz on port 8080. Open 465/TCP and 587/TCP publicly; keep 8080 restricted to platform health checks.

## Local run

    npm install
    DATABASE_URL='postgresql://...' AURELINK_COMMUNICATIONS_ENCRYPTION_KEY='same-backend-secret' SMTP_TLS_CERT_PATH='./certs/fullchain.pem' SMTP_TLS_KEY_PATH='./certs/privkey.pem' npm start

Do not commit certificates, keys, database URLs, or provider credentials.
