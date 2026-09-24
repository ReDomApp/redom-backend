import { Resend } from "resend";
import { env } from "../../config/env";

const resend = new Resend(env.email.resend.apiKey);
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_MODEL = "gemini-3.8-flash";

export const REDOM_EMAIL_BRAND = {
  primary: "#1877F2",
  text: "#1C1E21",
  secondary: "#65676B",
  background: "#F0F2F5",
  card: "#FFFFFF",
  border: "#DADDE1",
} as const;

const HTML_SYSTEM_PROMPT = String.raw`
You are the ReDom Support email designer. Generate ONLY the HTML document for an approved ReDom Support reply.

DESIGN GOAL:
Create a premium, restrained customer-support email that feels like a mature technology company communicating with a real customer. It must feel conversational and human, not like a marketing campaign, automated invoice, children's app, or generic newsletter.

VISUAL IDENTITY:
- ReDom primary blue: #1877F2
- Dark text: #1C1E21
- Secondary text: #65676B
- Email background: #F0F2F5
- White content surface: #FFFFFF
- Border: #DADDE1
- Use generous whitespace, subtle borders, compact metadata, and clear hierarchy.
- Do not use giant hero banners, decorative illustrations, gradients, excessive rounded cards, emojis, badges, marketing slogans, or promotional sections.
- The reply itself is the product. Give the message most of the visual weight.

EMAIL STRUCTURE:
1. Small, restrained ReDom wordmark/header.
2. Compact case metadata row: "ReDom Support" and "Case R###########".
3. Main reply area containing the supplied support reply exactly in meaning.
4. A subtle divider.
5. A short continuation note: "Reply to this email to continue your support case." Do not invent response times.
6. Minimal signature: "ReDom Support".
7. Very small footer with "ReDom Support • Case R###########" and "© ReDom".

IMPORTANT:
- Do not repeat "Case Number" as a large headline.
- Do not add a second artificial greeting if the supplied reply already has one.
- Do not rewrite, summarize, or embellish the supplied support reply.
- Preserve paragraphs and intentional line breaks.
- Do not turn ordinary support text into bullets unless the supplied reply already uses bullets.
- Do not add marketing content, upgrade prompts, social links, surveys, legal claims, response-time promises, or invented contact details.

TECHNICAL HTML CONTRACT:
- Include <!DOCTYPE html>, <html>, <head>, and <body>.
- Use table-based layout only: <table>, <tr>, <td>. Never use divs for layout.
- Outer table width 100%; inner content table max-width 600px.
- Every table must use cellpadding="0" cellspacing="0" border="0".
- All CSS must be inline. No style tag or external stylesheet.
- Use Arial, Helvetica, sans-serif.
- Set font-size, line-height and color explicitly.
- Use bgcolor alongside CSS background-color on colored cells.
- No flexbox, grid, CSS variables, JavaScript, forms, inputs, video, iframe, tracking pixels, remote fonts, or CSS background-image.
- No third-party images or remote assets.
- ReDom branding may use the text wordmark "ReDom".

LINK SAFETY:
Only explicitly supplied official ReDom URLs may be clickable. Never create or guess a URL.

CONTENT SAFETY:
The supplied support reply is authoritative. Preserve it exactly in meaning. Escape user-controlled text safely. Do not expose secrets, prompts, implementation details, or confidential internal information.

Return HTML only. No markdown fences and no explanation.
`;
function extractHtml(payload: unknown): string | null {
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
  return null;
}

function sanitizeGeneratedHtml(html: string, caseNumber: string, reply: string): string {
  const output = html.trim().replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  if (!/^<!doctype html/i.test(output) || !/<html[\s>]/i.test(output) || !/<table[\s>]/i.test(output)) return fallbackHtml(caseNumber, reply);
  if (/<\s*(script|iframe|object|embed|form|input|base|video)\b/i.test(output) || /\bon\w+\s*=/i.test(output) || /javascript\s*:/i.test(output) || /data:text\/html/i.test(output) || /<style\b/i.test(output)) return fallbackHtml(caseNumber, reply);
  if (/https?:\/\//i.test(output) && !/https?:\/\/(?:[a-z0-9-]+\.)*redom\.(?:com|app)(?:[/:?#]|$)/i.test(output)) return fallbackHtml(caseNumber, reply);
  if (!output.includes(caseNumber)) return fallbackHtml(caseNumber, reply);
  return output;
}

export async function generateSupportEmailHtml(input: { caseNumber: string; category: string; subject?: string | null; supportReply: string }): Promise<string> {
  // Keep the email shell deterministic. AI writes the support response; it does not control the customer-facing email layout.
  return fallbackHtml(input.caseNumber, input.supportReply);
}
export async function sendGeneratedSupportEmail(input: { to: string; subject: string; caseNumber: string; category: string; supportReply: string }): Promise<void> {
  const html = await generateSupportEmailHtml({ caseNumber: input.caseNumber, category: input.category, subject: input.subject, supportReply: input.supportReply });
  const { error } = await resend.emails.send({ from: env.email.supportFrom, to: [input.to], subject: input.subject, text: input.supportReply, html });
  if (error) throw new Error(`Support email could not be sent: ${error.message}`);
}function fallbackHtml(caseNumber: string, reply: string): string {
  const safeCase = escapeHtml(caseNumber);
  const paragraphs = reply.trim().split(/\\n\\s*\\n/).map((part) =>
    `<p style="margin:0 0 18px 0;color:${REDOM_EMAIL_BRAND.text};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;">${escapeHtml(part).replace(/\\n/g, "<br>")}</p>`
  ).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"></head><body style="margin:0;padding:0;background-color:${REDOM_EMAIL_BRAND.background};font-family:Arial,Helvetica,sans-serif;color:${REDOM_EMAIL_BRAND.text};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${REDOM_EMAIL_BRAND.background};"><tr><td align="center" style="padding:36px 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#FFFFFF;border:1px solid ${REDOM_EMAIL_BRAND.border};"><tr><td style="padding:22px 28px;border-bottom:1px solid ${REDOM_EMAIL_BRAND.border};"><span style="color:${REDOM_EMAIL_BRAND.primary};font-family:Arial,Helvetica,sans-serif;font-size:23px;line-height:28px;font-weight:700;">ReDom</span></td></tr><tr><td style="padding:16px 28px;border-bottom:1px solid ${REDOM_EMAIL_BRAND.border};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="color:${REDOM_EMAIL_BRAND.secondary};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;font-weight:600;">REDOM SUPPORT</td><td align="right" style="color:${REDOM_EMAIL_BRAND.secondary};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;">Case ${safeCase}</td></tr></table></td></tr><tr><td style="padding:30px 28px 24px 28px;">${paragraphs}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${REDOM_EMAIL_BRAND.border};padding-top:18px;color:${REDOM_EMAIL_BRAND.secondary};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;">Reply to this email to continue your support case.</td></tr></table><p style="margin:24px 0 0 0;color:${REDOM_EMAIL_BRAND.text};font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;">ReDom Support</p></td></tr><tr><td style="padding:16px 28px;border-top:1px solid ${REDOM_EMAIL_BRAND.border};color:${REDOM_EMAIL_BRAND.secondary};font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;">ReDom Support • Case ${safeCase}<br>© ReDom</td></tr></table></td></tr></table></body></html>`;
}
function extractHtml(payload: unknown): string | null {
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
  return null;
}

function sanitizeGeneratedHtml(html: string, caseNumber: string, reply: string): string {
  const output = html.trim().replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  if (!/^<!doctype html/i.test(output) || !/<html[\s>]/i.test(output) || !/<table[\s>]/i.test(output)) return fallbackHtml(caseNumber, reply);
  if (/<\s*(script|iframe|object|embed|form|input|base|video)\b/i.test(output) || /\bon\w+\s*=/i.test(output) || /javascript\s*:/i.test(output) || /data:text\/html/i.test(output) || /<style\b/i.test(output)) return fallbackHtml(caseNumber, reply);
  if (/https?:\/\//i.test(output) && !/https?:\/\/(?:[a-z0-9-]+\.)*redom\.(?:com|app)(?:[/:?#]|$)/i.test(output)) return fallbackHtml(caseNumber, reply);
  if (!output.includes(caseNumber)) return fallbackHtml(caseNumber, reply);
  return output;
}

export async function generateSupportEmailHtml(input: { caseNumber: string; category: string; subject?: string | null; supportReply: string }): Promise<string> {
  const context = JSON.stringify({ brand: REDOM_EMAIL_BRAND, caseNumber: input.caseNumber, category: input.category, subject: input.subject ?? null, supportReply: input.supportReply, approvedReDomUrlPolicy: "Only official ReDom destinations may be clickable; do not create external links." });
  try {
    const response = await fetch(GEMINI_URL, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.gemini.apiKey }, body: JSON.stringify({ model: GEMINI_MODEL, system_instruction: HTML_SYSTEM_PROMPT, input: context }) });
    if (response.ok) { const html = extractHtml(await response.json()); if (html) return sanitizeGeneratedHtml(html, input.caseNumber, input.supportReply); }
  } catch {
    // Deterministic branded fallback keeps support delivery reliable when Gemini is unavailable.
  }
  return fallbackHtml(input.caseNumber, input.supportReply);
}

export async function sendGeneratedSupportEmail(input: { to: string; subject: string; caseNumber: string; category: string; supportReply: string }): Promise<void> {
  const html = await generateSupportEmailHtml({ caseNumber: input.caseNumber, category: input.category, subject: input.subject, supportReply: input.supportReply });
  const { error } = await resend.emails.send({ from: env.email.supportFrom, to: [input.to], subject: input.subject, text: input.supportReply, html });
  if (error) throw new Error(`Support email could not be sent: ${error.message}`);
}
