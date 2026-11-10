/**
 * TEMPORARY DIRECT-RESEND SMTP ADAPTER
 *
 * For development/testing while Aurelink's own TCP SMTP gateway is unavailable.
 * This module does not replace the planned Aurelink-issued SMTP credentials.
 * Never expose the account-level RESEND_API_KEY to customers.
 *
 * The caller must issue a domain-scoped sending-only Resend API key using
 * createAurelinkResendSmtpKey and show the returned token once.
 * Resend SMTP uses username "resend" and the scoped token as its password.
 * Delete/disable this adapter once the Aurelink gateway is operational.
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
