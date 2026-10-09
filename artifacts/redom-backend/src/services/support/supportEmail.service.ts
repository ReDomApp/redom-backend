import { Resend } from "resend";
import { createHash } from "node:crypto";
import { recordOpsEmailEvent } from "../operations/daily-ops-intelligence.service";
import { env } from "../../config/env";
import { isAllowedSupportEmailUrl, buildSupportEmailActions, renderSupportInlineLinkTokens } from "./supportWebLinks.service";
import { getAccountContextByEmail } from "./support.service";

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
  return value.split(/\n/).map((line) => renderSupportInlineLinkTokens(renderInlineFormatting(line), "html")).join("<br>");
}

export type SupportEmailAction = {
  label: string;
  path?: string;
  url?: string;
};

function supportWebUrl(action: SupportEmailAction): string | null {
  const raw = action.url?.trim() || action.path?.trim();
  if (!raw) return null;
  if (action.url) return isAllowedSupportEmailUrl(raw) ? raw : null;
  const base = env.email.webBaseUrl.replace(/\/+$/, "");
  const normalized = raw.startsWith("/") ? raw : "/" + raw;
  const url = base + normalized;
  return isAllowedSupportEmailUrl(url) ? url : null;
}

function renderActionButtons(actions: SupportEmailAction[]): string {
  if (!actions.length) return "";
  const buttons = actions.map((action) => {
    const label = escapeHtml(action.label.trim());
    const resolved = supportWebUrl(action);
    if (!label || !resolved) return "";
    const href = escapeHtml(resolved);
    return '<a href="' + href + '" style="display:inline-block;margin:0 8px 10px 0;padding:12px 18px;background:' + REDOM_EMAIL_BRAND.primary + ';color:#FFFFFF;text-decoration:none;border-radius:9px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;font-weight:700;">' + label + '</a>';
  }).join("");
  if (!buttons) return "";
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px 0;"><tr><td>' + buttons + '</td></tr></table>';
}


function renderCompanyEmailFooter(): string {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">' +
    '<tr><td style="padding:24px 0 8px;border-top:1px solid ' + REDOM_EMAIL_BRAND.border + ';text-align:center;">' +
    '<div style="display:inline-block;width:34px;height:34px;border-radius:9px;background:#1877F2;color:#FFFFFF;font:bold 18px/34px Arial;text-align:center;">R</div>' +
    '<div style="margin-top:8px;font:bold 14px/20px Arial;color:' + REDOM_EMAIL_BRAND.text + ';">ReDom Platforms, Inc.</div>' +
    '<div style="margin-top:4px;font:11px/17px Arial;color:' + REDOM_EMAIL_BRAND.secondary + ';">Technology services behind ReDom — a social platform for connection, communication, sharing, discovery and digital experiences.</div>' +
    '<div style="margin-top:8px;font:11px/17px Arial;color:' + REDOM_EMAIL_BRAND.secondary + ';">ReDom Way, Parkside Court · 495 Flatbush Ave, Brooklyn, NY 11225, USA</div>' +
    '<div style="margin-top:8px;font:11px/17px Arial;">' +
    '<a href="https://about.wnncompany.com" style="color:' + REDOM_EMAIL_BRAND.primary + ';text-decoration:underline;">About ReDom</a> · ' +
    '<a href="https://docs.wnncompany.com" style="color:' + REDOM_EMAIL_BRAND.primary + ';text-decoration:underline;">Documentation</a> · ' +
    '<a href="https://help.wnncompany.com" style="color:' + REDOM_EMAIL_BRAND.primary + ';text-decoration:underline;">Help Center</a> · ' +
    '<a href="mailto:support@wnncompany.com" style="color:' + REDOM_EMAIL_BRAND.primary + ';text-decoration:underline;">support@wnncompany.com</a>' +
    '</div></td></tr></table>';
}

function fallbackHtml(caseNumber: string, reply: string, actions: SupportEmailAction[] = []): string {
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
${renderActionButtons(actions)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="border-top:1px solid ${REDOM_EMAIL_BRAND.border};padding-top:18px;color:${REDOM_EMAIL_BRAND.secondary};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;">Reply to this email to continue your support case.</td></tr>
</table>
<p style="margin:24px 0 0 0;color:${REDOM_EMAIL_BRAND.text};font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;">ReDom Support</p>
</td></tr>
${renderCompanyEmailFooter()}
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
  actions?: SupportEmailAction[];
}): Promise<string> {
  // Keep the customer-facing email shell deterministic. AI supplies the support message; it does not control the email layout.
  const body = input.supportReply.replace(/^Case Number:\s*R\d{11}\s*\n\s*/i, "").trim();
  return fallbackHtml(input.caseNumber, body, input.actions ?? []);
}

export async function sendGeneratedSupportEmail(input: {
  to: string;
  subject: string;
  caseNumber: string;
  category: string;
  supportReply: string;
  actions?: SupportEmailAction[];
  idempotencyKey?: string;
  inReplyToMessageId?: string | null;
}): Promise<void> {
  const paymentCategory = /payment|refund|billing|subscription|payout/i.test(input.category);
  const actions = (input.actions ?? []).filter((item) => {
    const url = item.url?.trim();
    if (!url) return true;
    if (!isAllowedSupportEmailUrl(url)) return false;
    try {
      const parsed = new URL(url);
      const configuredWebOrigin = new URL(env.email.webBaseUrl).origin;
      const configuredDocsOrigin = new URL(env.email.supportDocsUrl).origin;
      const configuredHelpOrigin = new URL(env.email.supportHelpUrl).origin;
      const stripe = parsed.hostname === "stripe.com" || parsed.hostname.endsWith(".stripe.com");
      const redomSupport = parsed.origin === configuredDocsOrigin || parsed.origin === configuredHelpOrigin;
      return parsed.origin === configuredWebOrigin || redomSupport || (stripe && paymentCategory);
    } catch {
      return false;
    }
  });
  const html = await generateSupportEmailHtml({ ...input, actions });
  const logicalEmailId = createHash("sha256").update(input.idempotencyKey ?? (input.to.toLowerCase() + "|" + input.subject + "|" + input.caseNumber)).digest("hex");
  await recordOpsEmailEvent({ logicalEmailId, subsystem: "support", eventType: "attempted", recipient: input.to, caseId: null }).catch(() => undefined);
  const { data, error } = await resend.emails.send({
    from: env.email.supportFrom,
    to: [input.to],
    subject: input.subject,
    text: renderSupportInlineLinkTokens(input.supportReply, "text"),
    html,
    headers: {
      "Auto-Submitted": "auto-replied",
      ...(input.inReplyToMessageId ? {
        "In-Reply-To": input.inReplyToMessageId,
        "References": input.inReplyToMessageId,
      } : {}),
    },
  }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined);
  if (error) {
    await recordOpsEmailEvent({ logicalEmailId, subsystem: "support", eventType: "failed", recipient: input.to, metadata: { error: error.message } }).catch(() => undefined);
    throw new Error(`Support email could not be sent: ${error.message}`);
  }
  await recordOpsEmailEvent({ logicalEmailId, subsystem: "support", eventType: "accepted", recipient: input.to, providerMessageId: data?.id ?? null }).catch(() => undefined);
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
  from?: string;
}): Promise<void> {
  const safe = (value: string) => escapeHtml(value);
  const refundAccount = await getAccountContextByEmail(input.to);
  const refundActions = await buildSupportEmailActions({
    account: refundAccount,
    message: "refund " + input.transactionNumber + " " + input.reason,
    category: "refund_payment",
    caseNumber: input.caseNumber,
    policySlug: "refunds",
  });
  const idempotencyKey = "refund-status/" + input.caseNumber + "/" + input.transactionNumber + "/" + createHash("sha256").update(input.status + "|" + input.reason + "|" + (input.nextStep ?? "") + "|" + (input.refundId ?? "") + "|" + String(Boolean(input.terminal))).digest("hex").slice(0,24);
  if (input.terminal) {
    const statusColor = /completed|successful|processed/i.test(input.status) ? "#1877f2" : /rejected|failed|expired|closed/i.test(input.status) ? "#e41e3f" : "#8a5a00";
    const statusBg = /completed|successful|processed/i.test(input.status) ? "#eaf2ff" : /rejected|failed|expired|closed/i.test(input.status) ? "#fdecef" : "#fff4d6";
    const row = (label:string,value?:string|null) => value ? '<tr><td style="padding:12px 0;border-bottom:1px solid #dadde1;font:12px/18px Arial;color:#65676b;">'+safe(label)+'</td><td align="right" style="padding:12px 0;border-bottom:1px solid #dadde1;font:700 14px/20px Arial;color:#1c1e21;word-break:break-word;">'+safe(value)+'</td></tr>' : "";
    const html = '<!doctype html><html><body style="margin:0;padding:24px;background:#f0f2f5;font-family:Arial,sans-serif;color:#1c1e21;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid #dadde1;"><tr><td style="padding:22px 26px;border-bottom:1px solid #dadde1;"><strong style="font-size:24px;color:#1877f2;">ReDom</strong><span style="float:right;font-size:11px;font-weight:700;color:#65676b;letter-spacing:.7px;">REFUND SERVICES</span></td></tr><tr><td style="padding:30px 26px 12px;"><div style="font-size:11px;font-weight:700;color:#65676b;letter-spacing:1px;">FINAL REFUND DECISION</div><div style="font-size:27px;font-weight:800;margin-top:7px;">'+safe(input.status)+'</div><div style="display:inline-block;margin-top:12px;padding:7px 12px;background:'+statusBg+';color:'+statusColor+';font-size:12px;font-weight:800;">TERMINAL</div></td></tr><tr><td style="padding:18px 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">'+row("Case Number",input.caseNumber)+row("ReDom Transaction ID",input.transactionNumber)+row("Amount",input.amount&&input.currency?input.amount+" "+input.currency:null)+row("Currency",input.currency)+row("Refund destination",input.target)+row("Refund ID",input.refundId)+row("Decision reason",input.reason)+'</table></td></tr><tr><td style="padding:0 26px 22px;"><div style="padding:15px;background:#fff8e1;border:1px solid #f1d48a;font:12px/19px Arial;color:#65676b;"><strong style="color:#1c1e21;">Security warning</strong><br>'+renderInlineFormatting(input.securityWarning)+'</div>${renderActionButtons(refundActions)}</td></tr><tr><td style="padding:18px 26px;background:#f7f8fa;border-top:1px solid #dadde1;font:11px/17px Arial;color:#65676b;">This is a final ReDom refund transaction notice. No reply is required for this terminal notification. © ReDom</td></tr></table></td></tr></table></body></html>';
    const text = "ReDom Refund Services\n\nFINAL REFUND DECISION\n\nStatus: "+input.status+"\nCase Number: "+input.caseNumber+"\nTransaction ID: "+input.transactionNumber+"\nAmount: "+(input.amount&&input.currency?input.amount+" "+input.currency:"")+"\nRefund destination: "+(input.target??"")+"\nRefund ID: "+(input.refundId??"")+"\nReason: "+input.reason+"\n\n"+input.securityWarning;
    const { error } = await resend.emails.send({from: input.from ?? env.email.supportFrom,to:[input.to],subject:"ReDom Refund — "+input.status+" — "+input.transactionNumber,text,html},{idempotencyKey});
    if(error) throw new Error("Refund terminal email could not be sent: "+error.message);
    return;
  }
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
<tr><td style="padding:0 24px 24px;font:12px/19px Arial;color:${REDOM_EMAIL_BRAND.secondary};">${closed ? "<strong>This refund case has reached a terminal state.</strong>" : "<strong>Reply to this email</strong> to continue your existing ReDom refund support case."}</td></tr><tr><td style="padding:0 24px 8px;">${renderActionButtons(refundActions)}</td></tr>
<tr><td style="padding:18px 24px;background:#F7F8FA;border-top:1px solid ${REDOM_EMAIL_BRAND.border};font:11px/17px Arial;color:${REDOM_EMAIL_BRAND.secondary};">Case ${safe(input.caseNumber)} · Transaction ${safe(input.transactionNumber)}<br><br>${renderInlineFormatting(input.securityWarning)}</td></tr>${renderCompanyEmailFooter()}
</table></td></tr></table></body></html>`;

  const text = "ReDom Refund Case\n\nCase: " + input.caseNumber + "\nTransaction: " + input.transactionNumber + "\nStatus: " + input.status + "\nReason: " + input.reason + (input.nextStep ? "\nNext step: " + input.nextStep : "") + "\n\n" + input.securityWarning;
  const { error } = await resend.emails.send({ from: input.from ?? env.email.supportFrom, to: [input.to], subject: "ReDom Refunds — " + input.status + " — " + input.transactionNumber, text, html }, { idempotencyKey });
  if (error) throw new Error("Refund case email could not be sent: " + error.message);
}
