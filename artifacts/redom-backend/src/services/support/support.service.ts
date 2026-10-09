import { createHash, randomInt } from "node:crypto";
import { recordOpsEmailEvent } from "../operations/daily-ops-intelligence.service";
import { Resend } from "resend";
import { env } from "../../config/env";
import { pool } from "../../database/db";
import { REDOM_SUPPORT_SYSTEM_PROMPT, SUPPORT_JSON_SCHEMA } from "./supportPolicy";
import { renderSupportInlineLinkTokens } from "./supportWebLinks.service";
import { getReDomPublicAiProductContext } from "../redomPublicAiProductPolicy";

export type SupportAccountContext = {
  userId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emailVerified: boolean | null;
  phoneVerified: boolean | null;
  accountStatus: string | null;
};

export type SupportCase = {
  id: string;
  caseNumber: string;
  userId: string | null;
  requesterEmail: string | null;
  subject: string | null;
  category: string;
  status: "awaiting_support" | "awaiting_user" | "closed";
  reminderSentAt: string | null;
  lastUserMessageAt: string | null;
  lastAiMessageAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportMessage = {
  id: string;
  senderType: "user" | "ai" | "system";
  senderEmail: string | null;
  body: string;
  createdAt: string;
};

export type SupportAiResult = { is_safe: boolean; support_reply: string | null; policySlug?: string | null };

const resend = new Resend(env.email.resend.apiKey);
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
// 3.8 is preferred, but support must remain available if a single model is under temporary load.
const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"] as const;
const CASE_PATTERN = /\bR\d{11}\b/i;
const PAYMENT_PROVIDER_KNOWLEDGE = `Payment-provider general knowledge for ReDom Payments. Apply this knowledge when a question is directly about payments OR indirectly concerns a paid product, subscription, plan, tier, package, purchase, checkout, billing, price, currency, country availability, payment method, invoice, receipt, refund, or how a paid ReDom product works. Do not wait for the customer to name a payment provider:

- Business availability is country/region dependent. The current official availability list is authoritative and should be linked with [[STRIPE_DOC:countries|supported countries]] when the customer asks for the current list.
- Payment-method availability depends on the business country/region, customer locale, currency, and the payment method itself.
- More than 135 payment currencies are supported for presentment, but currency availability can vary by country and payment method.
- Presentment currency is the currency charged to the customer; settlement currency is the currency accepted by the destination bank account. A conversion may occur when they differ.
- Payment-method flows can be immediate or delayed. Delayed methods can remain processing until a later success/failure notification, so ReDom Payments should not describe a transaction as successful until the backend confirms it.
- Payment methods can be used with PaymentIntents; reusable payment methods can also be saved with SetupIntents when the applicable flow supports it.
- Checkout is a prebuilt payment experience; payment-method availability still depends on the applicable country, currency, and configuration.
- Refunds are provider payment operations, but ReDom refund eligibility, case status, approval, and timing are controlled by the ReDom Backend and must never be inferred from provider documentation.
- Provider documentation is available through controlled tokens only: [[STRIPE_DOC:countries|supported countries]], [[STRIPE_DOC:currencies|supported currencies]], [[STRIPE_DOC:payment-methods-guide|payment methods]], [[STRIPE_DOC:checkout|checkout]], [[STRIPE_DOC:refunds-guide|refunds]], [[STRIPE_DOC:payment-intents|PaymentIntents]], and [[STRIPE_DOC:setup-intents|saving payment methods]].
`;

function mapCase(row: Record<string, unknown>): SupportCase {
  return {
    id: String(row.id), caseNumber: String(row.case_number), userId: row.user_id ? String(row.user_id) : null,
    requesterEmail: row.requester_email ? String(row.requester_email) : null, subject: row.subject ? String(row.subject) : null,
    category: String(row.category), status: String(row.status) as SupportCase["status"],
    reminderSentAt: row.reminder_sent_at ? new Date(String(row.reminder_sent_at)).toISOString() : null,
    lastUserMessageAt: row.last_user_message_at ? new Date(String(row.last_user_message_at)).toISOString() : null,
    lastAiMessageAt: row.last_ai_message_at ? new Date(String(row.last_ai_message_at)).toISOString() : null,
    closedAt: row.closed_at ? new Date(String(row.closed_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapMessage(row: Record<string, unknown>): SupportMessage {
  return {
    id: String(row.id), senderType: String(row.sender_type) as SupportMessage["senderType"],
    senderEmail: row.sender_email ? String(row.sender_email) : null, body: String(row.body),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function generateCaseNumber(): string {
  return `R${randomInt(0, 100_000_000_000).toString().padStart(11, "0")}`;
}

export function extractCaseNumber(value: string): string | null {
  const match = value.match(CASE_PATTERN);
  return match ? match[0].toUpperCase() : null;
}

export function classifySupportCategory(text: string): string {
  const value = text.toLowerCase();
  if (/refund|chargeback|charged|payment/.test(value)) return "refund_payment";
  if (/verification|verify|identity|document/.test(value)) return "verification";
  if (/suspend|suspension|ban|restricted|appeal/.test(value)) return "moderation_appeal";
  if (/security|hacked|login|password|account access/.test(value)) return "security";
  if (/subscription|premium/.test(value)) return "subscription";
  if (/payout|creator earnings|earnings/.test(value)) return "creator_payout";
  if (/marketplace|listing|seller|buyer/.test(value)) return "marketplace";
  if (/advertis|campaign|ad account/.test(value)) return "advertising";
  if (/report|abuse|harass/.test(value)) return "abuse_report";
  if (/bug|crash|error|not working|website|app/.test(value)) return "technical";
  return "general";
}

function toAccountContext(row: Record<string, unknown>): SupportAccountContext {
  return {
    userId: String(row.id), username: row.username ? String(row.username) : null,
    firstName: row.first_name ? String(row.first_name) : null, lastName: row.last_name ? String(row.last_name) : null,
    email: row.email ? String(row.email) : null,
    emailVerified: row.email_verified === null || row.email_verified === undefined ? null : Boolean(row.email_verified),
    phoneVerified: row.phone_verified === null || row.phone_verified === undefined ? null : Boolean(row.phone_verified),
    accountStatus: row.account_status ? String(row.account_status) : null,
  };
}

export async function getAccountContextById(userId: string): Promise<SupportAccountContext | null> {
  const result = await pool.query(
    `SELECT id, username, first_name, last_name, email, email_verified, phone_verified, account_status FROM users WHERE id = $1 LIMIT 1`, [userId],
  );
  return result.rows.length ? toAccountContext(result.rows[0]) : null;
}

export async function getAccountContextByEmail(email: string): Promise<SupportAccountContext | null> {
  const result = await pool.query(
    `SELECT id, username, first_name, last_name, email, email_verified, phone_verified, account_status FROM users WHERE lower(email) = lower($1) LIMIT 1`, [email.trim()],
  );
  return result.rows.length ? toAccountContext(result.rows[0]) : null;
}

export async function createSupportCase(input: { userId?: string | null; requesterEmail?: string | null; subject?: string | null; category?: string }): Promise<SupportCase> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const caseNumber = generateCaseNumber();
    try {
      const result = await pool.query(
        `INSERT INTO support_cases (case_number, user_id, requester_email, subject, category, status, last_user_message_at) VALUES ($1, $2, $3, $4, $5, 'awaiting_support', now()) RETURNING *`,
        [caseNumber, input.userId ?? null, input.requesterEmail?.trim() || null, input.subject?.trim() || null, input.category ?? "general"],
      );
      return mapCase(result.rows[0]);
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
    }
  }
  throw new Error("Unable to allocate a unique support case number.");
}

export async function getSupportCase(caseNumber: string): Promise<SupportCase | null> {
  const result = await pool.query(`SELECT * FROM support_cases WHERE case_number = $1 LIMIT 1`, [caseNumber.toUpperCase()]);
  return result.rows.length ? mapCase(result.rows[0]) : null;
}

export async function getOwnedSupportCase(userId: string, caseNumber: string): Promise<SupportCase | null> {
  const result = await pool.query(`SELECT * FROM support_cases WHERE case_number = $1 AND user_id = $2 LIMIT 1`, [caseNumber.toUpperCase(), userId]);
  return result.rows.length ? mapCase(result.rows[0]) : null;
}

export async function getSupportCaseMessages(caseId: string, limit = 20): Promise<SupportMessage[]> {
  const result = await pool.query(`SELECT id, sender_type, sender_email, body, created_at FROM support_case_messages WHERE case_id = $1 ORDER BY created_at DESC LIMIT $2`, [caseId, Math.min(Math.max(limit, 1), 50)]);
  return result.rows.reverse().map(mapMessage);
}

export async function addSupportMessage(input: { caseId: string; senderType: "user" | "ai" | "system"; senderEmail?: string | null; body: string }): Promise<SupportMessage> {
  const result = await pool.query(`INSERT INTO support_case_messages (case_id, sender_type, sender_email, body) VALUES ($1, $2, $3, $4) RETURNING id, sender_type, sender_email, body, created_at`, [input.caseId, input.senderType, input.senderEmail ?? null, input.body]);
  if (input.senderType === "user") {
    await pool.query(`UPDATE support_cases SET status = 'awaiting_support', last_user_message_at = now(), reminder_sent_at = NULL, updated_at = now() WHERE id = $1 AND status <> 'closed'`, [input.caseId]);
  } else if (input.senderType === "ai") {
    await pool.query(`UPDATE support_cases SET status = 'awaiting_user', last_ai_message_at = now(), updated_at = now() WHERE id = $1 AND status <> 'closed'`, [input.caseId]);
  }
  return mapMessage(result.rows[0]);
}

export async function listOwnedSupportCases(userId: string, limit = 50): Promise<SupportCase[]> {
  const result = await pool.query(`SELECT * FROM support_cases WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [userId, Math.min(Math.max(limit, 1), 100)]);
  return result.rows.map(mapCase);
}

export type InboundEventClaim = "claimed" | "processed" | "processing";

export async function claimInboundEvent(svixId: string, emailId: string): Promise<InboundEventClaim> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize claims for the same provider email ID without depending on a
    // production-only unique index from an older migration.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [emailId]);

    const existing = await client.query(
      `SELECT status, processing_started_at FROM support_inbound_events WHERE email_id = $1 LIMIT 1`,
      [emailId],
    );

    if (!existing.rows[0]) {
      await client.query(
        `INSERT INTO support_inbound_events (svix_id, email_id, status, processing_started_at)
         VALUES ($1, $2, 'processing', now())`,
        [svixId, emailId],
      );
      await client.query("COMMIT");
      return "claimed";
    }

    const status = String(existing.rows[0].status);
    if (status === "processed") {
      await client.query("COMMIT");
      return "processed";
    }

    const stale = !existing.rows[0].processing_started_at
      || new Date(String(existing.rows[0].processing_started_at)).getTime() <= Date.now() - 10 * 60 * 1000;

    if (status === "failed" || (status === "processing" && stale)) {
      const reclaimed = await client.query(
        `UPDATE support_inbound_events
            SET svix_id = $2, status = 'processing', processing_started_at = now(), last_error = NULL
          WHERE email_id = $1
            AND (status = 'failed' OR (status = 'processing' AND (processing_started_at IS NULL OR processing_started_at <= now() - interval '10 minutes')))
          RETURNING status`,
        [emailId, svixId],
      );
      await client.query("COMMIT");
      return reclaimed.rows[0] ? "claimed" : "processing";
    }

    await client.query("COMMIT");
    return "processing";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function markInboundEvent(svixId: string, emailId: string): Promise<void> {
  await pool.query(
    `UPDATE support_inbound_events
        SET status = 'processed', processed_at = COALESCE(processed_at, now()), processing_started_at = NULL, last_error = NULL
      WHERE svix_id = $1 AND email_id = $2`,
    [svixId, emailId],
  );
}

export async function markInboundEventFailed(svixId: string, emailId: string, errorMessage: string): Promise<void> {
  await pool.query(
    `UPDATE support_inbound_events
        SET status = 'failed', processing_started_at = NULL, last_error = LEFT($3, 1000)
      WHERE svix_id = $1 AND email_id = $2 AND status = 'processing'`,
    [svixId, emailId, errorMessage],
  );
}

export async function linkInboundEvent(svixId: string, caseId: string): Promise<void> {
  await pool.query(`UPDATE support_inbound_events SET case_id = $2 WHERE svix_id = $1`, [svixId, caseId]);
}

export async function findRecentActiveSupportCase(input: { userId?: string | null; requesterEmail: string; message: string }): Promise<SupportCase | null> {
  const result = await pool.query(
    `SELECT sc.*
       FROM support_cases sc
       JOIN support_case_messages scm ON scm.case_id = sc.id
      WHERE sc.status <> 'closed'
        AND lower(COALESCE(sc.requester_email, '')) = lower($1)
        AND scm.sender_type = 'user'
        AND regexp_replace(lower(trim(scm.body)), E'\\s+', ' ', 'g') = regexp_replace(lower(trim($2)), E'\\s+', ' ', 'g')
        AND scm.created_at >= now() - interval '30 minutes'
        AND ($3::uuid IS NULL OR sc.user_id = $3::uuid)
      ORDER BY scm.created_at DESC
      LIMIT 1`,
    [input.requesterEmail.trim(), input.message, input.userId ?? null],
  );
  return result.rows[0] ? mapCase(result.rows[0]) : null;
}

export async function permanentlyCloseSupportCase(caseId: string): Promise<void> {
  await pool.query(`UPDATE support_cases SET status = 'closed', closed_at = COALESCE(closed_at, now()), updated_at = now() WHERE id = $1 AND status <> 'closed'`, [caseId]);
}

export async function markReminderSent(caseId: string): Promise<void> {
  await pool.query(`UPDATE support_cases SET reminder_sent_at = now(), updated_at = now() WHERE id = $1 AND status = 'awaiting_user'`, [caseId]);
}

export async function getInactiveWaitingCases(): Promise<SupportCase[]> {
  const result = await pool.query(`SELECT * FROM support_cases WHERE status = 'awaiting_user' AND closed_at IS NULL AND ((reminder_sent_at IS NULL AND last_ai_message_at <= now() - interval '24 hours') OR (reminder_sent_at IS NOT NULL AND reminder_sent_at <= now() - interval '2 hours')) ORDER BY updated_at ASC LIMIT 100`);
  return result.rows.map(mapCase);
}

function extractGeminiText(payload: unknown): string {
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  const steps = Array.isArray(record.steps) ? record.steps : [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i] as Record<string, unknown>;
    const content = Array.isArray(step.content) ? step.content : [];
    for (let j = content.length - 1; j >= 0; j -= 1) {
      const block = content[j] as Record<string, unknown>;
      if (typeof block.text === "string") return block.text;
    }
  }
  throw new Error("Gemini did not return text output.");
}


function sanitizePaymentProviderBranding(reply: string): string {
  // Preserve controlled link tokens while normalizing any model leakage outside them.
  const protectedTokens: string[] = [];
  let tokenized = reply.replace(/\[\[(REDOM_POLICY|REDOM_HELP|STRIPE_DOC):[A-Za-z0-9_-]+\|[^\]]+\]\]/g, token => {
    protectedTokens.push(token);
    return `@@RE_DOM_SUPPORT_LINK_${protectedTokens.length - 1}@@`;
  });

  // If the model ignored the no-raw-URL rule, convert recognized official payment
  // documentation URLs into the same controlled clickable-token system.
  tokenized = tokenized.replace(/https?:\/\/(?:www\.)?(?:stripe\.com|docs\.stripe\.com)(?:[^\s<>"')\`\]]*)?/gi, rawUrl => {
    const lower = rawUrl.toLowerCase();
    const key = /\/global(?:[/?#]|$)/.test(lower) || /country|countries|availability/.test(lower)
      ? "countries"
      : /\/currenc/.test(lower)
        ? "currencies"
        : /refund/.test(lower)
          ? "refunds-guide"
          : /checkout/.test(lower)
            ? "checkout"
            : /payment[_-]?methods|payment-methods|payments\/payment-methods/.test(lower)
              ? "payment-methods-guide"
              : "payment-methods-guide";
    const label = key === "countries"
      ? "supported countries"
      : key === "currencies"
        ? "supported currencies"
        : key === "refunds-guide"
          ? "refund information"
          : key === "checkout"
            ? "checkout documentation"
            : "payment methods";
    return `[[STRIPE_DOC:${key}|${label}]]`;
  });

  return tokenized
    .replace(/\b(?:stripe(?:\.com)?|stripe's|stripes)\b/gi, "ReDom Payments")
    .replace(/@@RE_DOM_SUPPORT_LINK_(\d+)@@/g, (_whole, index) => protectedTokens[Number(index)] ?? "");
}
function parseGeminiSupportResult(text: string): SupportAiResult {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); } catch {
    const start = trimmed.indexOf("{"); const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Gemini returned invalid support JSON.");
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  }
  const value = parsed as Record<string, unknown>;
  if (typeof value.is_safe !== "boolean") throw new Error("Gemini support response is missing is_safe.");
  if (value.support_reply !== null && typeof value.support_reply !== "string") throw new Error("Gemini support response has an invalid support_reply.");
  const reply = typeof value.support_reply === "string" ? sanitizePaymentProviderBranding(value.support_reply) : null;
  return { is_safe: value.is_safe, support_reply: reply };
}

async function requestGeminiSupport(model: string, requestContext: object): Promise<SupportAiResult> {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.gemini.apiKey },
    body: JSON.stringify({ model, system_instruction: REDOM_SUPPORT_SYSTEM_PROMPT, input: JSON.stringify(requestContext), response_format: { type: "text", mime_type: "application/json", schema: SUPPORT_JSON_SCHEMA } }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(`Gemini support request failed (${response.status}): ${body.slice(0, 500)}`) as Error & { status?: number; body?: string };
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return parseGeminiSupportResult(extractGeminiText(await response.json()));
}

export async function generateSupportReply(input: { message: string; account: SupportAccountContext | null; supportCase: SupportCase; history: SupportMessage[]; approvedPolicyContext?: string | null; approvedPolicySlug?: string | null }): Promise<SupportAiResult> {
  const requestContext = {
    account: input.account,
    case: { caseNumber: input.supportCase.caseNumber, category: input.supportCase.category, status: input.supportCase.status, subject: input.supportCase.subject },
    recentConversation: input.history.map((message) => ({ sender: message.senderType, message: message.body })),
    currentUserMessage: input.message,
    payment_provider_knowledge: PAYMENT_PROVIDER_KNOWLEDGE,
    approvedPolicyContext: input.approvedPolicyContext ?? null,
    approvedPolicySlug: input.approvedPolicySlug ?? null,
    public_product_knowledge: getReDomPublicAiProductContext(),
    link_token_rules: {
      redom_policy: "Use [[REDOM_POLICY:<approvedPolicySlug>|Label]] only when an approved ReDom policy was used and a link is genuinely useful.",
      redom_help: "Use [[REDOM_HELP:<approved-help-key>|Label]] only for a relevant ReDom help destination.",
      stripe_docs: "Use [[STRIPE_DOC:<approved-stripe-doc-key>|Label]] only when the user asks for payment documentation or when a current official provider fact needs a useful source. Allowed keys are countries, global-availability, currencies, payment-methods, payment-methods-guide, checkout, refunds, refunds-guide, payment-intents, setup-intents. Visible labels must describe ReDom Payments or the documentation topic and must never name the external provider.",
      no_raw_urls: true,
    },
  };

  let lastError: unknown;
  for (const model of GEMINI_MODELS) {
    try {
      return await requestGeminiSupport(model, requestContext);
    } catch (error) {
      lastError = error;
      // A temporary provider/model overload should fail over immediately. Do not make the customer wait through long retries.
      const status = (error as { status?: number }).status;
      if (status !== 429 && status !== 500 && status !== 502 && status !== 503) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All Gemini support models are temporarily unavailable.");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderSupportReplyHtml(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const rendered: string[] = [];
  let paragraph: string[] = [];

  const inline = (value: string): string => {
    let result = escapeHtml(value);
    result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    result = result.replace(/`([^`]+)`/g, '<code style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">$1</code>');
    result = result.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "<em>$1</em>");
    return result;
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    rendered.push('<p style="margin:0 0 14px 0;line-height:1.55;">' + inline(paragraph.join(" ")) + "</p>");
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flushParagraph(); continue; }
    const numbered = line.match(/^(\d+[a-z]?\.)\s+(.+)$/i);
    const bulleted = line.match(/^([-*])\s+(.+)$/);
    if (numbered || bulleted) {
      flushParagraph();
      const listMarker = numbered?.[1] ?? bulleted?.[1] ?? "";
      const content = numbered?.[2] ?? bulleted?.[2] ?? "";
      rendered.push('<div style="margin:0 0 8px 0;line-height:1.55;">' + inline(listMarker) + " " + inline(content) + "</div>");
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return rendered.join("");
}
export function formatCaseReply(caseNumber: string, reply: string): string {
  return `Case Number: ${caseNumber}\n\n${reply.trim()}`;
}

export async function sendSupportEmail(to: string, subject: string, body: string): Promise<void> {
  const html = `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111827;background:#ffffff;"><div lang="en" dir="ltr">${renderSupportReplyHtml(body)}</div></body></html>`;
  const logicalEmailId = createHash("sha256").update(to.toLowerCase() + "|" + subject + "|" + body).digest("hex");
  await recordOpsEmailEvent({ logicalEmailId, subsystem: "support", eventType: "attempted", recipient: to }).catch(() => undefined);
  const { data, error } = await resend.emails.send({ from: env.email.supportFrom, to: [to], subject, html, text: body });
  if (error) {
    await recordOpsEmailEvent({ logicalEmailId, subsystem: "support", eventType: "failed", recipient: to, metadata: { error: error.message } }).catch(() => undefined);
    throw new Error(`Support email could not be sent: ${error.message}`);
  }
  await recordOpsEmailEvent({ logicalEmailId, subsystem: "support", eventType: "accepted", recipient: to, providerMessageId: data?.id ?? null }).catch(() => undefined);
}

export async function sendSupportReminder(to: string, caseNumber: string): Promise<void> {
  await sendSupportEmail(to, `Re: Support Case ${caseNumber}`, `We haven't received a response regarding your support request.\n\nIf you still need assistance, please reply within the next 2 hours to keep this case active.\n\nCase Number: ${caseNumber}`);
}

export async function getCaseRequesterEmail(caseId: string): Promise<string | null> {
  const result = await pool.query(`SELECT requester_email FROM support_cases WHERE id = $1 LIMIT 1`, [caseId]);
  return result.rows.length && result.rows[0].requester_email ? String(result.rows[0].requester_email) : null;
}
