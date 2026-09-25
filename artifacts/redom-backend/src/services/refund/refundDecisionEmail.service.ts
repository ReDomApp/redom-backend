import { Resend } from "resend";
import { env } from "../../config/env";
import { openai } from "../../lib/openai";
import { sendRefundCaseEmail } from "../support/supportEmail.service";

const resend = new Resend(env.email.resend.apiKey);

export const REFUND_EMAIL_SECURITY_WARNING =
  "Security warning: ReDom will never ask for your password, payment PIN, CVV, full card number, bank login, or a one-time verification code outside the official refund verification flow. Never forward or share a verification code with anyone.";

export type RefundDecisionEmailFacts = {
  customerEmail: string;
  transactionNumber: string;
  caseNumber: string;
  status: string;
  decision: "approved" | "rejected" | "provider_failure" | "non_refundable" | "processing";
  reason: string;
  amount: string;
  currency: string;
  target: string;
  refundId?: string | null;
};

type GeneratedRefundEmail = { subject: string; html: string };

const ALLOWED_TAGS = new Set([
  "html", "head", "body", "meta", "title", "table", "tbody", "thead", "tr", "td", "th",
  "div", "span", "p", "strong", "b", "em", "i", "small", "h1", "h2", "h3", "br"
]);
const ALLOWED_ATTRS = new Set([
  "style", "role", "width", "height", "cellpadding", "cellspacing", "border",
  "align", "valign", "bgcolor", "colspan", "rowspan", "charset", "name"
]);

function formatRefundAmountFromMinor(value: string): string {
  const raw = String(value ?? "").trim();
  if (!/^-?\\d+$/.test(raw)) return raw || "0.00";
  const negative = raw.startsWith("-");
  const digits = negative ? raw.slice(1) : raw;
  const minor = BigInt(digits || "0");
  const major = minor / 100n;
  const cents = (minor % 100n).toString().padStart(2, "0");
  return (negative ? "-" : "") + major.toString() + "." + cents;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function normalizeForMatch(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function sanitizeStyle(style: string): string {
  return style
    .replace(/url\s*\([^)]*\)/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/@import[^;]+;?/gi, "")
    .replace(/behavior\s*:[^;]+;?/gi, "")
    .replace(/-moz-binding\s*:[^;]+;?/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/data\s*:/gi, "")
    .replace(/position\s*:\s*(fixed|absolute)[^;]*;?/gi, "")
    .replace(/z-index\s*:[^;]+;?/gi, "")
    .trim();
}

function sanitizeRefundHtml(input: string, facts: RefundDecisionEmailFacts): string {
  let html = String(input ?? "")
    .replace(/<!--(?:.|\n|\r)*?-->/g, "")
    .replace(/<\/?(?:script|style|iframe|frame|frameset|object|embed|form|input|button|textarea|select|option|svg|math|link|base|video|audio|source|img|picture|canvas)[^>]*>/gi, "")
    .replace(/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\b(?:href|src|action|formaction|poster|cite|background)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  html = html.replace(/<\/?([a-z0-9:-]+)([^>]*)>/gi, function(full, tagName, rawAttrs) {
    const tag = String(tagName).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (full.startsWith("</")) return "</" + tag + ">";

    const attrs: string[] = [];
    String(rawAttrs ?? "").replace(/([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g,
      function(_m, name, d1, d2, d3) {
        const attr = String(name).toLowerCase();
        if (!ALLOWED_ATTRS.has(attr)) return "";
        if (attr === "style") {
          const safeStyle = sanitizeStyle(String(d1 ?? d2 ?? d3 ?? ""));
          if (safeStyle) attrs.push('style="' + escapeHtml(safeStyle) + '"');
        } else {
          const value = String(d1 ?? d2 ?? d3 ?? "");
          attrs.push(attr + '="' + escapeHtml(value) + '"');
        }
        return "";
      });
    return attrs.length ? "<" + tag + " " + attrs.join(" ") + ">" : "<" + tag + ">";
  });

  if (!/^\s*<!doctype html>/i.test(html)) html = "<!doctype html>" + html;

  const lower = normalizeForMatch(html);
  const required = [
    facts.transactionNumber, facts.caseNumber, facts.status, facts.reason,
    facts.amount, facts.currency, facts.target, REFUND_EMAIL_SECURITY_WARNING
  ];

  for (const value of required) {
    if (!value || !lower.includes(normalizeForMatch(String(value)))) {
      throw new Error("OpenAI refund email failed authoritative-fact validation.");
    }
  }

  if (/<(?:script|iframe|form|object|embed|svg|img|input|button|textarea|select)\b/i.test(html)) {
    throw new Error("OpenAI refund email contains a forbidden HTML element.");
  }
  if (/\bon[a-z]+\s*=|\b(?:href|src|action|formaction)\s*=|javascript\s*:|data\s*:/i.test(html)) {
    throw new Error("OpenAI refund email contains an unsafe HTML attribute or URL.");
  }

  return html;
}

function validateSubject(subject: string, facts: RefundDecisionEmailFacts): string {
  const clean = String(subject ?? "").replace(/[\r\n]+/g, " ").trim();
  if (!clean || clean.length > 180) throw new Error("OpenAI refund email returned an invalid subject.");
  if (!normalizeForMatch(clean).includes(normalizeForMatch(facts.transactionNumber))) {
    throw new Error("Refund email subject does not contain the authoritative transaction number.");
  }
  if (!normalizeForMatch(clean).includes(normalizeForMatch(facts.status))) {
    throw new Error("Refund email subject does not contain the authoritative status.");
  }
  return clean;
}

async function generateWithOpenAI(facts: RefundDecisionEmailFacts, model: string): Promise<GeneratedRefundEmail> {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { subject: { type: "string" }, html: { type: "string" } },
    required: ["subject", "html"]
  };

  const response = await openai.responses.create({
    model,
    store: false,
    instructions: [
      "Generate the final customer-facing ReDom refund decision email.",
      "The backend facts are authoritative and immutable.",
      "You are an email formatter, not the refund decision-maker.",
      "Never change, reinterpret, soften, reverse, omit, or invent the decision, status, reason, amount, currency, transaction number, case number, refund target, or refund ID.",
      "Generate professional, accessible transactional HTML.",
      "Do not include scripts, forms, inputs, buttons, images, external resources, external links, JavaScript, event handlers, tracking pixels, or unsafe URLs.",
      "Use inline CSS and email-safe tables when useful.",
      "The security warning must appear verbatim.",
      "Return only the structured subject and html."
    ].join(" "),
    input: JSON.stringify({ authoritative_backend_facts: facts, security_warning: REFUND_EMAIL_SECURITY_WARNING }),
    text: { format: { type: "json_schema", name: "redom_refund_decision_email", strict: true, schema } }
  } as any);

  const raw = String(response.output_text ?? "").trim();
  if (!raw) throw new Error("OpenAI returned no refund email.");

  let parsed: GeneratedRefundEmail;
  try {
    parsed = JSON.parse(raw) as GeneratedRefundEmail;
  } catch {
    throw new Error("OpenAI returned invalid structured refund email output.");
  }

  return {
    subject: validateSubject(parsed.subject, facts),
    html: sanitizeRefundHtml(parsed.html, facts)
  };
}

export async function sendRefundDecisionEmail(facts: RefundDecisionEmailFacts): Promise<void> {
  let generated: GeneratedRefundEmail | null = null;
  let lastError: unknown = null;

  // OpenAI is only responsible for formatting the customer-facing email.
  // The backend facts and refund decision remain authoritative.
  // Try two models, with two attempts per model, before using the deterministic backend template.
  const models = ["gpt-5.6-luna", "gpt-5.6-sol"];

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        generated = await generateWithOpenAI(facts, model);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (generated) break;
  }

  if (generated) {
    const text = [
      "ReDom Refund Services", "",
      "Case Number: " + facts.caseNumber,
      "Transaction: " + facts.transactionNumber,
      "Status: " + facts.status,
      "Decision: " + facts.decision,
      "Reason: " + facts.reason,
      "Amount: " + facts.amount + " " + facts.currency,
      "Refund destination: " + facts.target,
      facts.refundId ? "Refund ID: " + facts.refundId : "",
      "", REFUND_EMAIL_SECURITY_WARNING
    ].filter(Boolean).join("\n");

    const { error } = await resend.emails.send({
      from: env.refunds.from,
      to: [facts.customerEmail],
      subject: generated.subject,
      text,
      html: generated.html
    });

    if (!error) return;
    lastError = new Error("OpenAI-generated refund decision email could not be sent: " + error.message);
  }

  // If all OpenAI attempts fail, the backend sends the standard deterministic
  // refund template. It still uses refunds@ so the final decision stays on the
  // dedicated refund sender and does not depend on AI availability.
  try {
    await sendRefundCaseEmail({
      to: facts.customerEmail,
      caseNumber: facts.caseNumber,
      transactionNumber: facts.transactionNumber,
      status: facts.status,
      reason: facts.reason,
      amount: facts.amount,
      currency: facts.currency,
      target: facts.target,
      refundId: facts.refundId ?? null,
      securityWarning: REFUND_EMAIL_SECURITY_WARNING,
      terminal: ["approved", "rejected", "provider_failure", "non_refundable"].includes(facts.decision),
      from: env.refunds.from,
    });
    return;
  } catch (fallbackError) {
    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "unknown fallback error";
    const openAIMessage = lastError instanceof Error ? lastError.message : "unknown OpenAI error";
    throw new Error("Refund decision email failed through OpenAI and the standard backend fallback: " + fallbackMessage + " (OpenAI: " + openAIMessage + ")");
  }
}
