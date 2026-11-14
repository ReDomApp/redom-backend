/**
 * TEMPORARY DIRECT-RESEND SMTP ADAPTER
 *
 * For production customer SMTP while Aurelink's own TCP SMTP gateway is not yet deployed and verified.
 * This is the active temporary transport, not a development-only escape hatch.
 * Never expose the account-level RESEND_API_KEY to customers; issue only domain-scoped sending keys.
 *
 * The caller must issue a domain-scoped sending-only Resend API key using
 * createAurelinkResendSmtpKey and show the returned token once.
 * Resend SMTP uses username "resend" and the scoped token as its password.
 * Keep customer-facing Resend support intact during and after the gateway transition; switch the transport only after the Aurelink gateway is deployed and verified.
 */
export const TEMPORARY_RESEND_SMTP = Object.freeze({
  host: "smtp.resend.com",
  port: 465,
  encryption: "SSL/TLS",
  alternativePort: 587,
  alternativeEncryption: "STARTTLS",
  username: "resend",
  provider: "Resend (temporary direct SMTP)",
  temporary: true,
  gatewayRequired: false,
});

export function temporaryResendSmtpCredential(credential: {
  id: unknown;
  label: unknown;
  domain: unknown;
  password: string;
}) {
  return {
    id: credential.id,
    label: credential.label,
    domain: credential.domain,
    username: TEMPORARY_RESEND_SMTP.username,
    password: credential.password,
    temporary: true,
    warning: "Temporary direct Resend SMTP credentials. Store this password securely; it is displayed once.",
  };
}
