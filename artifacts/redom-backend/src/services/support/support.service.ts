import { randomInt } from "node:crypto";
import { Resend } from "resend";
import { env } from "../../config/env";
import { pool } from "../../database/db";
import { REDOM_SUPPORT_SYSTEM_PROMPT, SUPPORT_JSON_SCHEMA } from "./supportPolicy";

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

export type SupportAiResult = { is_safe: boolean; support_reply: string | null };

const resend = new Resend(env.email.resend.apiKey);
const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const CASE_PATTERN = /\bR\d{11}\b/i;

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

export async function markInboundEvent(svixId: string, emailId: string): Promise<boolean> {
  try {
    await pool.query(`INSERT INTO support_inbound_events (svix_id, email_id) VALUES ($1, $2)`, [svixId, emailId]);
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return false;
    throw error;
  }
}

export async function linkInboundEvent(svixId: string, caseId: string): Promise<void> {
  await pool.query(`UPDATE support_inbound_events SET case_id = $2 WHERE svix_id = $1`, [svixId, caseId]);
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
  return { is_safe: value.is_safe, support_reply: value.support_reply as string | null };
}

export async function generateSupportReply(input: { message: string; account: SupportAccountContext | null; supportCase: SupportCase; history: SupportMessage[] }): Promise<SupportAiResult> {
  const requestContext = {
    account: input.account,
    case: { caseNumber: input.supportCase.caseNumber, category: input.supportCase.category, status: input.supportCase.status, subject: input.supportCase.subject },
    recentConversation: input.history.map((message) => ({ sender: message.senderType, message: message.body })),
    currentUserMessage: input.message,
  };
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.gemini.apiKey },
    body: JSON.stringify({ model: GEMINI_MODEL, system_instruction: REDOM_SUPPORT_SYSTEM_PROMPT, input: JSON.stringify(requestContext), response_format: { type: "text", mime_type: "application/json", schema: SUPPORT_JSON_SCHEMA } }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini support request failed (${response.status}): ${body.slice(0, 500)}`);
  }
  return parseGeminiSupportResult(extractGeminiText(await response.json()));
}

export function formatCaseReply(caseNumber: string, reply: string): string {
  return `Case Number: ${caseNumber}\n\n${reply.trim()}`;
}

export async function sendSupportEmail(to: string, subject: string, body: string): Promise<void> {
  const { error } = await resend.emails.send({ from: env.email.supportFrom, to: [to], subject, text: body });
  if (error) throw new Error(`Support email could not be sent: ${error.message}`);
}

export async function sendSupportReminder(to: string, caseNumber: string): Promise<void> {
  await sendSupportEmail(to, `Re: Support Case ${caseNumber}`, `We haven't received a response regarding your support request.\n\nIf you still need assistance, please reply within the next 2 hours to keep this case active.\n\nCase Number: ${caseNumber}`);
}

export async function getCaseRequesterEmail(caseId: string): Promise<string | null> {
  const result = await pool.query(`SELECT requester_email FROM support_cases WHERE id = $1 LIMIT 1`, [caseId]);
  return result.rows.length && result.rows[0].requester_email ? String(result.rows[0].requester_email) : null;
}
