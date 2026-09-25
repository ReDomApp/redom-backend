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

function renderInlineFormatting(value: string): string {
  const escaped = escapeHtml(value);
  const tokens: string[] = [];
  const protect = (html: string) => { const key = "__REDOM_FMT_" + tokens.length + "__"; tokens.push(html); return key; };
  let output = escaped;
  output = output.replace(/`([^`\n]+)`/g, (_, text) => protect('<span style="font-family:Consolas,\'Courier New\',monospace;font-size:14px;background-color:#F0F2F5;padding:2px 5px;">' + text + '</span>'));
  output = output.replace(/\*\*([^*\n]+)\*\*/g, (_, text) => protect('<strong>' + text + '</strong>'));
  output = output.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_, text) => protect('<em>' + text + '</em>'));
  return output.replace(/__REDOM_FMT_(\d+)__/g, (_, index) => tokens[Number(index)]);
}

function renderSupportText(value: string): string {
  return value.split(/\n/).map((line) => renderInlineFormatting(line)).join("<br>");
}
function fallbackHtml(caseNumber: string, reply: string): string {
  const safeCase = escapeHtml(caseNumber);
  const paragraphs = reply.trim().split(/\n\s*\n/).map((part) =>
    `<p style="margin:0 0 18px 0;color:${REDOM_EMAIL_BRAND.text};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;">${renderSupportText(part)}</p>`
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
<tr><td style="padding:16px 28px;border-top:1px solid ${REDOM_EMAIL_BRAND.border};color:${REDOM_EMAIL_BRAND.secondary};font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;">
<strong style="color:${REDOM_EMAIL_BRAND.text};">ReDom Platforms, Inc.</strong><br>
<a href="https://www.google.com/maps/search/?api=1&amp;query=Brooklyn%2C%20NY%2011225" style="color:${REDOM_EMAIL_BRAND.primary};text-decoration:underline;">1001-10/7 ReDom Way, Parkside Court, Brooklyn, NY 11225</a><br>
© ReDom
</td></tr>
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


export async function sendRefundCaseEmail(input: {
  to: string;
  caseNumber: string;
  transactionNumber: string;
  status: string;
  reason: string;
  target?: string | null;
  nextStep?: string | null;
  amount?: string;
  currency?: string;
  refundId?: string | null;
  securityWarning: string;
  terminal?: boolean;
}): Promise<void> {
  const safe = (value: string) => escapeHtml(value);
  const tone = /completed|successful|processed/i.test(input.status)
    ? { color: "#31A24C", bg: "#EAF7ED" }
    : /failed|rejected|expired|closed/i.test(input.status)
      ? { color: "#E41E3F", bg: "#FDECEF" }
      : /verification|required|attention/i.test(input.status)
        ? { color: "#8A5A00", bg: "#FFF4D6" }
        : { color: REDOM_EMAIL_BRAND.primary, bg: "#EAF2FF" };

  const line = (label: string, value?: string | null, strong = false) =>
    value ? '<tr><td style="padding:11px 0;border-bottom:1px solid ' + REDOM_EMAIL_BRAND.border + ';font:12px/18px Arial;color:' + REDOM_EMAIL_BRAND.secondary + ';">' +
      safe(label) + '</td><td align="right" style="padding:11px 0;border-bottom:1px solid ' + REDOM_EMAIL_BRAND.border + ';font: ' +
      (strong ? "700" : "500") + ' 14px/20px Arial;color:' + REDOM_EMAIL_BRAND.text + ';word-break:break-word;">' + safe(value) + '</td></tr>' : "";

  const step = (label: string, active: boolean, last = false) =>
    '<tr><td width="22" style="width:22px;vertical-align:top;"><div style="width:10px;height:10px;margin-top:4px;border-radius:50%;background:' +
    (active ? REDOM_EMAIL_BRAND.primary : REDOM_EMAIL_BRAND.border) + ';"></div>' +
    (!last ? '<div style="width:2px;height:24px;margin-left:4px;background:' + REDOM_EMAIL_BRAND.border + ';"></div>' : "") +
    '</td><td style="padding:0 0 ' + (last ? "0" : "11") + 'px 0;font: ' + (active ? "700" : "500") +
    ' 13px/18px Arial;color:' + (active ? REDOM_EMAIL_BRAND.text : REDOM_EMAIL_BRAND.secondary) + ';">' + safe(label) + "</td></tr>";

  const verification = /verification/i.test(input.status) || /verification/i.test(input.nextStep || "");
  const processing = /processing|review|initiated|under review/i.test(input.status);
  const completed = /completed|successful|processed/i.test(input.status);
  const closed = Boolean(input.terminal) || /closed|rejected|failed|expired/i.test(input.status);

  const timeline =
    step("Refund case created", true) +
    step("Security verification", verification || processing || completed || closed) +
    step("Refund review", processing || completed) +
    step("Refund processing", processing || completed) +
    step("Completed / closed", completed || closed, true);

  const reasonHtml = renderSupportText(input.reason);
  const nextHtml = input.nextStep ? renderSupportText(input.nextStep) : "";

  const html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F0F2F5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F5;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:#FFF;border:1px solid ${REDOM_EMAIL_BRAND.border};border-radius:16px;overflow:hidden;">
<tr><td style="padding:22px 24px;border-bottom:1px solid ${REDOM_EMAIL_BRAND.border};"><span style="font:800 24px/28px Arial;color:${REDOM_EMAIL_BRAND.primary};">ReDom</span><span style="float:right;font:700 11px/18px Arial;color:${REDOM_EMAIL_BRAND.secondary};letter-spacing:.7px;">REFUNDS</span></td></tr>
<tr><td style="padding:28px 24px 12px;"><div style="font:700 12px/18px Arial;color:${REDOM_EMAIL_BRAND.secondary};letter-spacing:.6px;">REFUND CASE</div><div style="font:800 25px/31px Arial;color:${REDOM_EMAIL_BRAND.text};margin-top:4px;">${safe(input.caseNumber)}</div><span style="display:inline-block;margin-top:12px;padding:7px 11px;border-radius:999px;background:${tone.bg};color:${tone.color};font:800 12px/16px Arial;">${safe(input.status)}</span></td></tr>
<tr><td style="padding:12px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8E1;border:1px solid #F1D48A;border-radius:12px;"><tr><td style="padding:14px;"><strong style="font:800 13px/18px Arial;color:${REDOM_EMAIL_BRAND.text};">Security warning</strong><div style="font:12px/18px Arial;color:${REDOM_EMAIL_BRAND.secondary};margin-top:4px;">${renderInlineFormatting(input.securityWarning)}</div></td></tr></table></td></tr>
<tr><td style="padding:18px 24px;"><div style="font:800 18px/24px Arial;color:${REDOM_EMAIL_BRAND.text};margin-bottom:12px;">Refund status</div><table role="presentation" cellpadding="0" cellspacing="0" border="0">${timeline}</table></td></tr>
<tr><td style="padding:0 24px 20px;"><div style="font:800 18px/24px Arial;color:${REDOM_EMAIL_BRAND.text};margin-bottom:8px;">Transaction</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${line("ReDom Transaction ID",input.transactionNumber,true)}${line("Amount",input.amount && input.currency ? input.amount+" "+input.currency : null,true)}${line("Refund destination",input.target)}${line("Refund ID",input.refundId)}</table></td></tr>
<tr><td style="padding:0 24px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;border:1px solid ${REDOM_EMAIL_BRAND.border};border-radius:12px;"><tr><td style="padding:15px;"><div style="font:800 15px/20px Arial;color:${REDOM_EMAIL_BRAND.text};">What happens next?</div><div style="font:13px/20px Arial;color:${REDOM_EMAIL_BRAND.secondary};margin-top:6px;">${reasonHtml}</div>${input.nextStep ? '<div style="margin-top:12px;padding-top:12px;border-top:1px solid '+REDOM_EMAIL_BRAND.border+';font:13px/20px Arial;color:'+REDOM_EMAIL_BRAND.text+';"><strong>Next step:</strong><br>'+nextHtml+'</div>' : ""}</td></tr></table></td></tr>
<tr><td style="padding:0 24px 24px;font:12px/19px Arial;color:${REDOM_EMAIL_BRAND.secondary};">${closed ? "<strong>This refund case has reached a terminal state.</strong>" : "<strong>Reply to this email</strong> to continue your existing ReDom refund support case."}</td></tr>
<tr><td style="padding:18px 24px;background:#F7F8FA;border-top:1px solid ${REDOM_EMAIL_BRAND.border};font:11px/17px Arial;color:${REDOM_EMAIL_BRAND.secondary};"><strong style="color:${REDOM_EMAIL_BRAND.text};">ReDom Platforms, Inc.</strong><br><a href="https://www.google.com/maps/search/?api=1&amp;query=Brooklyn%2C%20NY%2011225" style="color:${REDOM_EMAIL_BRAND.primary};text-decoration:underline;">1001-10/7 ReDom Way, Parkside Court, Brooklyn, NY 11225</a><br>Case ${safe(input.caseNumber)} · Transaction ${safe(input.transactionNumber)}<br><br>${renderInlineFormatting(input.securityWarning)}<br><br>© ReDom</td></tr>
</table></td></tr></table></body></html>`;

  const text = "ReDom Refund Case\n\nCase: " + input.caseNumber + "\nTransaction: " + input.transactionNumber + "\nStatus: " + input.status + "\nReason: " + input.reason + (input.nextStep ? "\nNext step: " + input.nextStep : "") + "\n\n" + input.securityWarning;
  const { error } = await resend.emails.send({ from: env.email.supportFrom, to: [input.to], subject: "ReDom Refunds — " + input.status + " — " + input.transactionNumber, text, html });
  if (error) throw new Error("Refund case email could not be sent: " + error.message);
}
