import { Resend } from "resend";
import { env } from "../../config/env";

const resend = new Resend(env.email.resend.apiKey);

export const REDOM_EMAIL_BRAND = {
  primary: "#1877F2",
  text: "#1C1E21",
  secondary: "#65676B",
  background: "#F0F2F5",
  card: "#FFFFFF",
  border: "#DADDE1",
} as const;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fallbackHtml(caseNumber: string, reply: string): string {
  const safeCase = escapeHtml(caseNumber);
  const paragraphs = reply.trim().split(/\n\s*\n/).map((part) =>
    `<p style="margin:0 0 18px 0;color:${REDOM_EMAIL_BRAND.text};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`
  ).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;padding:0;background-color:${REDOM_EMAIL_BRAND.background};font-family:Arial,Helvetica,sans-serif;color:${REDOM_EMAIL_BRAND.text};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${REDOM_EMAIL_BRAND.background}" style="background-color:${REDOM_EMAIL_BRAND.background};">
<tr><td align="center" style="padding:36px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="max-width:600px;background-color:#FFFFFF;border:1px solid ${REDOM_EMAIL_BRAND.border};">
<tr><td style="padding:22px 28px;border-bottom:1px solid ${REDOM_EMAIL_BRAND.border};">
<span style="color:${REDOM_EMAIL_BRAND.primary};font-family:Arial,Helvetica,sans-serif;font-size:23px;line-height:28px;font-weight:700;">ReDom</span>
</td></tr>
<tr><td style="padding:15px 28px;border-bottom:1px solid ${REDOM_EMAIL_BRAND.border};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="color:${REDOM_EMAIL_BRAND.secondary};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;font-weight:700;letter-spacing:.4px;">REDOM SUPPORT</td>
<td align="right" style="color:${REDOM_EMAIL_BRAND.secondary};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;">Case ${safeCase}</td>
</tr>
</table>
</td></tr>
<tr><td style="padding:30px 28px 24px 28px;">
${paragraphs}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="border-top:1px solid ${REDOM_EMAIL_BRAND.border};padding-top:18px;color:${REDOM_EMAIL_BRAND.secondary};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;">Reply to this email to continue your support case.</td></tr>
</table>
<p style="margin:24px 0 0 0;color:${REDOM_EMAIL_BRAND.text};font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;">ReDom Support</p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid ${REDOM_EMAIL_BRAND.border};color:${REDOM_EMAIL_BRAND.secondary};font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;">ReDom Support • Case ${safeCase}<br>© ReDom</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export async function generateSupportEmailHtml(input: {
  caseNumber: string;
  category: string;
  subject?: string | null;
  supportReply: string;
}): Promise<string> {
  // Keep the customer-facing email shell deterministic. AI supplies the support message; it does not control the email layout.
  const body = input.supportReply.replace(/^Case Number:\s*R\d{11}\s*\n\s*/i, "").trim();
  return fallbackHtml(input.caseNumber, body);
}

export async function sendGeneratedSupportEmail(input: {
  to: string;
  subject: string;
  caseNumber: string;
  category: string;
  supportReply: string;
}): Promise<void> {
  const html = await generateSupportEmailHtml(input);
  const { error } = await resend.emails.send({
    from: env.email.supportFrom,
    to: [input.to],
    subject: input.subject,
    text: input.supportReply,
    html,
  });
  if (error) throw new Error(`Support email could not be sent: ${error.message}`);
}
