import { Resend } from "resend";
import { env } from "../../config/env";

const resend = new Resend(env.email.resend.apiKey);

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatAmount(amountMinor: string, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(amountMinor) / 100);
}

function ordinal(day: number): string {
  const suffix = day % 10 === 1 && day % 100 !== 11 ? "st" : day % 10 === 2 && day % 100 !== 12 ? "nd" : day % 10 === 3 && day % 100 !== 13 ? "rd" : "th";
  return day + suffix;
}

function formatDate(value: Date | null): string {
  if (!value) return "Not available";
  const day = ordinal(value.getUTCDate());
  const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(value);
  return day + " " + month + ", " + value.getUTCFullYear();
}

function formatDateTime(value: Date | null): string {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(value) + " UTC";
}

function channelLabel(value?: string | null): string {
  const labels: Record<string, string> = {
    card: "Card",
    bank: "Bank",
    bank_transfer: "Bank Transfer",
    ussd: "USSD",
    mobile_money: "Mobile Money",
    qr: "QR",
    apple_pay: "Apple Pay",
    eft: "EFT",
    payattitude: "Payattitude",
  };
  return labels[String(value ?? "").toLowerCase()] ?? (value ? String(value) : "Not available");
}

function continentForCountry(countryCode?: string | null): string {
  const code = String(countryCode ?? "").toUpperCase();
  const map: Record<string, string> = {
    DZ: "Africa", NG: "Africa", GH: "Africa", KE: "Africa", ZA: "Africa", EG: "Africa", MA: "Africa", TZ: "Africa", UG: "Africa", RW: "Africa", CI: "Africa", SN: "Africa",
    US: "North America", CA: "North America", MX: "North America",
    BR: "South America", AR: "South America", CL: "South America", CO: "South America", PE: "South America",
    GB: "Europe", DE: "Europe", FR: "Europe", ES: "Europe", IT: "Europe", NL: "Europe", PT: "Europe", SE: "Europe", NO: "Europe", DK: "Europe", CH: "Europe", PL: "Europe",
    CN: "Asia", JP: "Asia", IN: "Asia", SG: "Asia", MY: "Asia", ID: "Asia", PH: "Asia", TH: "Asia", KR: "Asia", AE: "Asia", SA: "Asia",
    AU: "Oceania", NZ: "Oceania",
  };
  return map[code] ?? "Global";
}

export type PaymentEmailDetails = {
  providerReference: string;
  channel?: string | null;
  type?: string | null;
  bank?: string | null;
  account?: string | null;
  countryCode?: string | null;
};

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
  details?: PaymentEmailDetails;
  outcome?: string;
  refund?: { status: string; id?: string | null; expectedAt?: Date | null; processedAt?: Date | null; error?: string | null } | null;
}): Promise<void> {
  const firstName = escapeHtml(input.firstName?.trim() || "there");
  const plan = escapeHtml(input.planName);
  const amount = escapeHtml(formatAmount(input.amountMinor, input.currency));
  const interval = escapeHtml(input.interval);
  const reference = escapeHtml(input.reference);
  const paidAt = escapeHtml(formatDateTime(input.paidAt));
  const periodStart = escapeHtml(formatDate(input.paidAt));
  const periodEnd = escapeHtml(formatDate(input.nextBillingAt ?? null));
  const nextBilling = escapeHtml(formatDate(input.nextBillingAt ?? null));
  const outcome = String(input.outcome ?? "paid");
  const isPaid = outcome === "paid";
  const paymentState = escapeHtml(isPaid ? "Payment received" : "Payment failed");
  const refundStatus = input.refund?.status ? escapeHtml(input.refund.status) : "Not initiated";
  const refundExpected = escapeHtml(formatDate(input.refund?.expectedAt ?? null));
  const refundProcessed = escapeHtml(formatDate(input.refund?.processedAt ?? null));
  const providerReference = escapeHtml(input.details?.providerReference || input.reference);
  const channel = escapeHtml(channelLabel(input.details?.channel));
  const type = escapeHtml(input.details?.type || "Not available");
  const bank = escapeHtml(input.details?.bank || "Not available");
  const account = escapeHtml(input.details?.account || "Not available");
  const continent = escapeHtml(continentForCountry(input.details?.countryCode));

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:Arial,Helvetica,sans-serif;color:#1C1E21;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F5;"><tr><td align="center" style="padding:30px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:#FFFFFF;border:1px solid #DADDE1;">
<tr><td style="padding:24px 28px;border-bottom:1px solid #DADDE1;text-align:center;"><div style="font-size:24px;font-weight:700;color:#1877F2;">ReDom</div></td></tr>
<tr><td style="padding:30px 28px 10px;">
<h1 style="margin:0 0 12px;font-size:24px;line-height:32px;">${paymentState}</h1>
<p style="margin:0;font-size:16px;line-height:25px;"><strong>${firstName}</strong> ${isPaid ? "received your payment of" : "attempted a payment of"}</p>
<div style="margin:18px 0 20px;font-size:30px;line-height:36px;font-weight:700;color:#1C1E21;">${amount}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #DADDE1;">
<tr><td style="padding:13px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Currency</td><td align="right" style="padding:13px 16px;font-weight:700;border-bottom:1px solid #DADDE1;">${escapeHtml(input.currency)}</td></tr>
<tr><td style="padding:13px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Plan</td><td align="right" style="padding:13px 16px;font-weight:700;border-bottom:1px solid #DADDE1;">${plan}</td></tr>
<tr><td style="padding:13px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Billing</td><td align="right" style="padding:13px 16px;border-bottom:1px solid #DADDE1;">Recurring ${interval}</td></tr>
<tr><td style="padding:13px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Billing Period</td><td align="right" style="padding:13px 16px;border-bottom:1px solid #DADDE1;">${periodStart} – ${periodEnd}</td></tr>
<tr><td style="padding:13px 16px;color:#65676B;">Payment Status</td><td align="right" style="padding:13px 16px;">${paymentState}</td></tr>
${isPaid ? `<tr><td style="padding:13px 16px;color:#65676B;">Next Billing Date</td><td align="right" style="padding:13px 16px;">${nextBilling}</td></tr>` : ""}
</table>
</td></tr>
<tr><td style="padding:4px 28px 28px;">
<h2 style="font-size:17px;margin:0 0 12px;">Transaction Details</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #DADDE1;">
<tr><td style="padding:12px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Plan</td><td align="right" style="padding:12px 16px;border-bottom:1px solid #DADDE1;">${plan}</td></tr>
<tr><td style="padding:12px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Provider Reference</td><td align="right" style="padding:12px 16px;font-family:Consolas,'Courier New',monospace;font-size:13px;border-bottom:1px solid #DADDE1;">${providerReference}</td></tr>
<tr><td style="padding:12px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Date Paid</td><td align="right" style="padding:12px 16px;border-bottom:1px solid #DADDE1;">${paidAt}</td></tr>
<tr><td style="padding:12px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Bank</td><td align="right" style="padding:12px 16px;border-bottom:1px solid #DADDE1;">${bank}</td></tr>
<tr><td style="padding:12px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Channel</td><td align="right" style="padding:12px 16px;border-bottom:1px solid #DADDE1;">${channel}</td></tr>
<tr><td style="padding:12px 16px;color:#65676B;border-bottom:1px solid #DADDE1;">Type</td><td align="right" style="padding:12px 16px;border-bottom:1px solid #DADDE1;">${type}</td></tr>
<tr><td style="padding:12px 16px;color:#65676B;">Account</td><td align="right" style="padding:12px 16px;">${account}</td></tr>
</table>
${!isPaid ? `<div style="margin-top:18px;padding:14px 16px;background:#F0F2F5;border:1px solid #DADDE1;font-size:13px;line-height:20px;"><strong>Automatic refund</strong><br>Refund status: ${refundStatus}<br>Expected date: ${refundExpected}${input.refund?.processedAt ? `<br>Processed date: ${refundProcessed}` : ""}${input.refund?.error ? `<br>Refund processing note: ${escapeHtml(input.refund.error)}` : ""}</div>` : ""}
<p style="margin:18px 0 0;font-size:13px;line-height:20px;color:#65676B;">If you have any issues with payment, kindly reply to this email or send an email to <a href="mailto:support@wnncompany.com" style="color:#1877F2;">support@wnncompany.com</a>.</p>
<p style="margin:10px 0 0;font-size:13px;line-height:20px;color:#65676B;">For refund cases where this payment was not intended, please contact <a href="mailto:support@wnncompany.com" style="color:#1877F2;">support@wnncompany.com</a>.</p>
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #DADDE1;color:#65676B;font-size:11px;line-height:17px;text-align:center;">Modern Payments for ${continent}<br>© ReDom Platforms, Inc.</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [
    isPaid ? `ReDom payment received` : `ReDom payment failed`,
    `\n${input.firstName?.trim() || "Customer"} ${isPaid ? "received your payment of" : "attempted a payment of"} ${formatAmount(input.amountMinor, input.currency)}`,
    "",
    `Currency: ${input.currency}`,
    `Plan: ${input.planName}`,
    `Billing: Recurring ${input.interval}`,
    `Billing Period: ${formatDate(input.paidAt)} - ${formatDate(input.nextBillingAt ?? null)}`,
    `Payment Status: ${isPaid ? "Payment received" : "Payment failed"}`,\n    ...(isPaid ? [`Next Billing Date: ${formatDate(input.nextBillingAt ?? null)}`] : []),\n    ...(!isPaid ? [`Automatic Refund: ${input.refund?.status || "Not initiated"}`, `Refund Expected: ${formatDate(input.refund?.expectedAt ?? null)}`] : []),
    "",
    "Transaction Details",
    `Plan: ${input.planName}`,
    `Provider Reference: ${input.details?.providerReference || input.reference}`,
    `Date Paid: ${formatDateTime(input.paidAt)}`,
    `Bank: ${input.details?.bank || "Not available"}`,
    `Channel: ${channelLabel(input.details?.channel)}`,
    `Type: ${input.details?.type || "Not available"}`,
    `Account: ${input.details?.account || "Not available"}`,
    "",
    "If you have any issues with payment, kindly reply to this email or send an email to support@wnncompany.com.",
    "For refund cases where this payment was not intended, please contact support@wnncompany.com.",
    "",
    `Modern Payments for ${continentForCountry(input.details?.countryCode)}`,
    "© ReDom Platforms, Inc.",
  ].join("\n");

  const { error } = await resend.emails.send({
    from: env.email.paymentFrom,
    to: [input.to],
    subject: (isPaid ? "Payment received — ReDom " : "Payment failed — ReDom ") + input.planName,
    text,
    html,
  });
  if (error) throw new Error(`Email could not be sent: ${error.message}`);
}
