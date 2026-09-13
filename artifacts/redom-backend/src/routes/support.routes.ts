import { Router } from "express";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "../config/env";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  addSupportMessage,
  classifySupportCategory,
  createSupportCase,
  extractCaseNumber,
  formatCaseReply,
  generateSupportReply,
  getAccountContextByEmail,
  getAccountContextById,
  getCaseRequesterEmail,
  getOwnedSupportCase,
  getSupportCase,
  getSupportCaseMessages,
  linkInboundEvent,
  listOwnedSupportCases,
  markInboundEvent,
  sendSupportEmail,
  type SupportCase,
} from "../services/support/support.service";

const router = Router();
const resend = new Resend(env.email.resend.apiKey);

const chatSchema = z.object({
  message: z.string().trim().min(1).max(12_000),
  caseNumber: z.string().trim().regex(/^R\d{11}$/i).optional(),
});

function extractEmailAddress(value: string): string {
  const angle = value.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  const plain = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return plain?.[0]?.toLowerCase() ?? value.trim().toLowerCase();
}

function stripHtml(value: string): string {
  return value.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function emailBody(email: { text?: string | null; html?: string | null }): string {
  const text = email.text?.trim();
  if (text) return text;
  return email.html ? stripHtml(email.html) : "";
}

async function resolveCaseForMessage(input: {
  userId?: string | null;
  senderEmail: string;
  message: string;
  subject?: string | null;
  caseNumber?: string | null;
}): Promise<{ supportCase: SupportCase; closedCaseNumber?: string }> {
  const referenced = input.caseNumber || extractCaseNumber(`${input.subject ?? ""}\n${input.message}`);
  if (referenced) {
    const existing = input.userId
      ? await getOwnedSupportCase(input.userId, referenced)
      : await getSupportCase(referenced);
    if (existing) {
      const requester = await getCaseRequesterEmail(existing.id);
      const senderMatches = !requester || requester.toLowerCase() === input.senderEmail.toLowerCase();
      if (senderMatches && existing.status !== "closed") return { supportCase: existing };
      if (senderMatches && existing.status === "closed") {
        const newCase = await createSupportCase({ userId: input.userId, requesterEmail: input.senderEmail, subject: input.subject, category: classifySupportCategory(input.message) });
        return { supportCase: newCase, closedCaseNumber: existing.caseNumber };
      }
    }
  }

  return {
    supportCase: await createSupportCase({
      userId: input.userId,
      requesterEmail: input.senderEmail,
      subject: input.subject,
      category: classifySupportCategory(input.message),
    }),
  };
}

async function processSupportMessage(input: {
  message: string;
  userId?: string | null;
  senderEmail: string;
  subject?: string | null;
  caseNumber?: string | null;
}): Promise<{ supportCase: SupportCase; isSafe: boolean; reply: string | null }> {
  const { supportCase, closedCaseNumber } = await resolveCaseForMessage(input);
  await addSupportMessage({ caseId: supportCase.id, senderType: "user", senderEmail: input.senderEmail, body: input.message });

  if (closedCaseNumber) {
    const reply = `This support case has been permanently closed and cannot be reopened. If you're experiencing a new issue, please create a new support case. For your security, closed case numbers cannot be reused.\n\nA new support case has been created for this message.\n\nCase Number: ${supportCase.caseNumber}`;
    await addSupportMessage({ caseId: supportCase.id, senderType: "ai", senderEmail: env.email.supportFrom, body: reply });
    return { supportCase, isSafe: true, reply };
  }

  const account = input.userId ? await getAccountContextById(input.userId) : await getAccountContextByEmail(input.senderEmail);
  const history = await getSupportCaseMessages(supportCase.id, 20);
  let aiResult;
  try {
    aiResult = await generateSupportReply({ message: input.message, account, supportCase, history });
  } catch (error) {
    throw new Error(`Support AI unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!aiResult.is_safe || aiResult.support_reply === null) {
    return { supportCase, isSafe: false, reply: null };
  }

  const reply = formatCaseReply(supportCase.caseNumber, aiResult.support_reply);
  await addSupportMessage({ caseId: supportCase.id, senderType: "ai", senderEmail: env.email.supportFrom, body: reply });
  return { supportCase, isSafe: true, reply };
}

router.post("/chat", authMiddleware, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid support request." });

  try {
    const result = await processSupportMessage({
      message: parsed.data.message,
      userId: req.user!.userId,
      senderEmail: "authenticated-in-app-user",
      caseNumber: parsed.data.caseNumber,
    });
    if (!result.isSafe) return res.status(200).json({ success: true, is_safe: false, support_reply: null, caseNumber: result.supportCase.caseNumber });
    return res.status(200).json({ success: true, is_safe: true, support_reply: result.reply, caseNumber: result.supportCase.caseNumber, status: result.supportCase.status });
  } catch (error) {
    req.log?.error?.({ err: error }, "In-app support processing failed");
    return res.status(502).json({ success: false, message: "ReDom Support is temporarily unavailable. Please try again shortly." });
  }
});

router.get("/cases", authMiddleware, async (req, res) => {
  try {
    const cases = await listOwnedSupportCases(req.user!.userId);
    return res.status(200).json({ success: true, cases });
  } catch (error) {
    req.log?.error?.({ err: error }, "Support case list failed");
    return res.status(500).json({ success: false, message: "Unable to load your support history." });
  }
});

router.get("/cases/:caseNumber", authMiddleware, async (req, res) => {
  const caseNumber = String(req.params.caseNumber).toUpperCase();
  if (!/^R\d{11}$/.test(caseNumber)) return res.status(400).json({ success: false, message: "Invalid Case Number." });
  try {
    const supportCase = await getOwnedSupportCase(req.user!.userId, caseNumber);
    if (!supportCase) return res.status(404).json({ success: false, message: "Support case not found." });
    const messages = await getSupportCaseMessages(supportCase.id, 50);
    return res.status(200).json({ success: true, case: supportCase, messages });
  } catch (error) {
    req.log?.error?.({ err: error }, "Support case read failed");
    return res.status(500).json({ success: false, message: "Unable to load this support case." });
  }
});

router.post("/email/webhook", async (req, res) => {
  if (!env.email.resend.webhookSecret) return res.status(503).send("Support email webhook is not configured.");

  try {
    const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
    const id = String(req.headers["svix-id"] ?? "");
    const timestamp = String(req.headers["svix-timestamp"] ?? "");
    const signature = String(req.headers["svix-signature"] ?? "");
    if (!id || !timestamp || !signature) return res.status(400).send("Missing webhook signature headers.");

    const event = resend.webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret: env.email.resend.webhookSecret });
    if (event.type !== "email.received") return res.status(200).json({ received: true });

    const emailId = event.data.email_id;
    if (!await markInboundEvent(id, emailId)) return res.status(200).json({ received: true, duplicate: true });

    const { data: email, error } = await resend.emails.receiving.get(emailId);
    if (error || !email) throw new Error(error?.message || "Inbound email could not be retrieved.");

    const senderEmail = extractEmailAddress(email.from ?? "");
    const supportAddress = env.email.supportFrom.toLowerCase();
    if (!senderEmail || senderEmail === supportAddress || senderEmail === "noreply@wnncompany.com") return res.status(200).json({ received: true, ignored: true });

    const message = emailBody(email);
    if (!message) return res.status(200).json({ received: true, ignored: true });

    const account = await getAccountContextByEmail(senderEmail);
    const referenced = extractCaseNumber(`${email.subject ?? ""}\n${message}`);
    const result = await processSupportMessage({
      message,
      userId: account?.userId ?? null,
      senderEmail,
      subject: email.subject ?? "ReDom Support",
      caseNumber: referenced,
    });
    await linkInboundEvent(id, result.supportCase.id);

    if (result.isSafe && result.reply) {
      await sendSupportEmail(senderEmail, `Re: ${email.subject || "ReDom Support"} [${result.supportCase.caseNumber}]`, result.reply);
    }
    return res.status(200).json({ received: true, caseNumber: result.supportCase.caseNumber, is_safe: result.isSafe });
  } catch (error) {
    req.log?.error?.({ err: error }, "Support email webhook failed");
    return res.status(500).send("Support email processing failed.");
  }
});

export default router;
