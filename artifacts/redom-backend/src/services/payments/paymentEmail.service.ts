import { Resend } from "resend";
import { env } from "../../config/env";

const resend = new Resend(env.email.resend.apiKey);

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatAmount(amountMinor: string, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(amountMinor) / 100);
}

function formatDate(value: Date | null): string {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(value) + " UTC";
}

export async function sendPaymentConfirmationEmail(input: {
  to: string;
  firstName?: string | null;
  planName: string;
  amountMinor: string;
  currency: string;
  interval: string;
  reference: string;
  paidAt: Date;
  nextBillingAt?: Date | null;
}): Promise<void> {
  const firstName = escapeHtml(input.firstName?.trim() || "there");
  const plan = escapeHtml(input.planName);
  const amount = escapeHtml(formatAmount(input.amountMinor, input.currency));
  const interval = escapeHtml(input.interval);
  const reference = escapeHtml(input.reference);
  const paidAt = escapeHtml(formatDate(input.paidAt));
  const nextBillingAt = escapeHtml(formatDate(input.nextBillingAt ?? null));

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:Arial,Helvetica,sans-serif;color:#1C1E21;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F5;"><tr><td align="center" style="padding:36px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border:1px solid #DADDE1;">
<tr><td style="padding:22px 28px;border-bottom:1px solid #DADDE1;"><span style="color:#1877F2;font-size:23px;font-weight:700;">ReDom</span></td></tr>
<tr><td style="padding:30px 28px 10px;"><h1 style="margin:0 0 12px;font-size:24px;">Payment confirmed</h1><p style="margin:0;font-size:16px;line-height:25px;">Hello ${firstName}, your ReDom subscription payment has been confirmed.</p></td></tr>
<tr><td style="padding:20px 28px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #DADDE1;">
<tr><td style="padding:13px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Plan</td><td align="right" style="padding:13px 16px;font-weight:700;border-bottom:1px solid #DADDE1;">${plan}</td></tr>
<tr><td style="padding:13px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Amount</td><td align="right" style="padding:13px 16px;font-weight:700;border-bottom:1px solid #DADDE1;">${amount}</td></tr>
<tr><td style="padding:13px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Billing</td><td align="right" style="padding:13px 16px;border-bottom:1px solid #DADDE1;">Recurring ${interval}</td></tr>
<tr><td style="padding:13px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Payment date</td><td align="right" style="padding:13px 16px;border-bottom:1px solid #DADDE1;">${paidAt}</td></tr>
<tr><td style="padding:13px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Next billing</td><td align="right" style="padding:13px 16px;border-bottom:1px solid #DADDE1;">${nextBillingAt}</td></tr>
<tr><td style="padding:13px 16px;color:#65676B;">Reference</td><td align="right" style="padding:13px 16px;font-family:Consolas,'Courier New',monospace;font-size:13px;">${reference}</td></tr>
</table>
<p style="margin:20px 0 0;color:#65676B;font-size:13px;line-height:20px;">Keep this email for your records. The reference can be used by ReDom Support to locate the payment.</p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #DADDE1;color:#65676B;font-size:11px;line-height:16px;">ReDom Payments<br>© ReDom</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [
    "ReDom payment confirmed",
    "",
    `Hello ${input.firstName?.trim() || "there"}, your ReDom subscription payment has been confirmed.`,
    "",
    `Plan: ${input.planName}`,
    `Amount: ${formatAmount(input.amountMinor, input.currency)}`,
    `Billing: Recurring ${input.interval}`,
    `Payment date: ${formatDate(input.paidAt)}`,
    `Next billing: ${formatDate(input.nextBillingAt ?? null)}`,
    `Reference: ${input.reference}`,
  ].join("\n");

  const { error } = await resend.emails.send({
    from: env.email.paymentFrom,
    to: [input.to],
    subject: "Your ReDom subscription payment is confirmed",
    text,
    html,
  });
  if (error) throw new Error(`Email could not be sent: ${error.message}`);
}
