import { createHash, randomInt, randomUUID } from "node:crypto";
import { Resend } from "resend";

type Channel = "sms" | "email";
type SmsProvider = "brevo" | "twilio";
type EmailProvider = "resend" | "brevo";

export interface SendSmsInput {
  recipient: string;
  sender: string;
  content: string;
  category: "transactional" | "marketing" | "otp" | "notification";
  tag?: string;
  webhookUrl?: string;
}
export interface SendEmailInput {
  recipient: string;
  sender: string;
  senderName?: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  tags?: string[];
}
export interface ProviderSendResult {
  provider: string;
  providerMessageId: string;
  acceptedAt: string;
}

const timeoutMs = 12_000;
async function jsonRequest(url: string, init: RequestInit): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.text();
    let parsed: any;
    try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = { message: body.slice(0, 300) }; }
    if (!response.ok) {
      const detail = typeof parsed?.message === "string" ? parsed.message : typeof parsed?.code === "string" ? parsed.code : "Provider request rejected.";
      throw new Error(`Provider HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Communication provider timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function sendBrevoSms(input: SendSmsInput): Promise<ProviderSendResult> {
  const key = process.env.AURELINK_BREVO_API_KEY || process.env.BREVO_API_KEY;
  if (!key) throw new Error("Brevo SMS is not configured.");
  const payload = {
    sender: input.sender,
    recipient: input.recipient.replace(/^\+/, ""),
    content: input.content,
    type: input.category === "marketing" ? "marketing" : "transactional",
    ...(input.tag ? { tag: input.tag } : {}),
    ...(input.webhookUrl ? { webUrl: input.webhookUrl } : {}),
  };
  const result = await jsonRequest("https://api.brevo.com/v3/transactionalSMS/send", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (result.messageId === undefined || result.messageId === null) throw new Error("Brevo accepted no message identifier.");
  return { provider: "brevo", providerMessageId: String(result.messageId), acceptedAt: new Date().toISOString() };
}

async function sendTwilioSms(input: SendSmsInput): Promise<ProviderSendResult> {
  const sid = process.env.AURELINK_TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.AURELINK_TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.AURELINK_TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) throw new Error("Twilio SMS is not configured.");
  const params = new URLSearchParams({ To: input.recipient, Body: input.content });
  if (from.startsWith("MG")) params.set("MessagingServiceSid", from); else params.set("From", from);
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const result = await jsonRequest(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!result.sid) throw new Error("Twilio accepted no message identifier.");
  return { provider: "twilio", providerMessageId: String(result.sid), acceptedAt: new Date().toISOString() };
}

async function sendResendEmail(input: SendEmailInput): Promise<ProviderSendResult> {
  const key = process.env.AURELINK_RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (!key) throw new Error("Resend email is not configured.");
  const client = new Resend(key);
  const result = await client.emails.send({
    from: input.senderName ? `${input.senderName} <${input.sender}>` : input.sender,
    to: input.recipient,
    subject: input.subject,
    ...(input.html ? { html: input.html } : {}),
    ...(input.text ? { text: input.text } : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    ...(input.tags?.length ? { tags: input.tags.map(name => ({ name, value: "aurelink" })) } : {}),
  });
  if (result.error) throw new Error(`Resend rejected the email: ${result.error.message}`);
  if (!result.data?.id) throw new Error("Resend accepted no email identifier.");
  return { provider: "resend", providerMessageId: result.data.id, acceptedAt: new Date().toISOString() };
}

async function sendBrevoEmail(input: SendEmailInput): Promise<ProviderSendResult> {
  const key = process.env.AURELINK_BREVO_API_KEY || process.env.BREVO_API_KEY;
  if (!key) throw new Error("Brevo Email API is not configured.");
  const payload = {
    sender: { email: input.sender, ...(input.senderName ? { name: input.senderName } : {}) },
    to: [{ email: input.recipient }],
    subject: input.subject,
    ...(input.html ? { htmlContent: input.html } : {}),
    ...(input.text ? { textContent: input.text } : {}),
    ...(input.replyTo ? { replyTo: { email: input.replyTo } } : {}),
    ...(input.tags?.length ? { tags: input.tags.slice(0, 10) } : {}),
  };
  const result = await jsonRequest("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!result.messageId) throw new Error("Brevo accepted no email identifier.");
  return { provider: "brevo", providerMessageId: String(result.messageId), acceptedAt: new Date().toISOString() };
}

/** Providers do delivery only; Aurelink owns consent, policy, verification, usage and billing. */
export async function sendAurelinkSms(provider: SmsProvider, input: SendSmsInput): Promise<ProviderSendResult> {
  if (!/^\+?[1-9]\d{7,14}$/.test(input.recipient)) throw new Error("Enter a valid E.164 SMS recipient.");
  if (!/^[A-Za-z0-9]{1,11}$/.test(input.sender)) throw new Error("SMS sender must be 1–11 alphanumeric characters.");
  if (!input.content.trim() || input.content.length > 5000) throw new Error("SMS content must contain 1–5000 characters.");
  if (input.category === "marketing" && !input.webhookUrl) throw new Error("Marketing SMS requires a delivery/opt-out event endpoint.");
  return provider === "brevo" ? sendBrevoSms(input) : sendTwilioSms(input);
}

export async function sendAurelinkEmail(provider: EmailProvider, input: SendEmailInput): Promise<ProviderSendResult> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipient)) throw new Error("Enter a valid recipient email address.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.sender)) throw new Error("Enter a valid verified sender address.");
  if (!input.subject.trim() || (!input.html?.trim() && !input.text?.trim())) throw new Error("Email subject and HTML or text content are required.");
  return provider === "resend" ? sendResendEmail(input) : sendBrevoEmail(input);
}

export function createOtpCode(): string { return String(randomInt(0, 1_000_000)).padStart(6, "0"); }
export function hashCommunicationContent(content: string): string { return sha256(content); }
export function makeVerificationHash(code: string, salt: string): string {
  return createHash("sha256").update(salt).update(":").update(code).digest("hex");
}
