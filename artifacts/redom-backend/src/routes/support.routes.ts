import { Router } from "express";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "../config/env";
import { pool } from "../database/db";
import { authMiddleware } from "../middleware/auth.middleware";
import { addSupportMessage, classifySupportCategory, createSupportCase, extractCaseNumber, formatCaseReply, getAccountContextByEmail, getAccountContextById, getCaseRequesterEmail, getOwnedSupportCase, getSupportCase, getSupportCaseMessages, linkInboundEvent, listOwnedSupportCases, markInboundEvent, type SupportCase } from "../services/support/support.service";
import { generatePolicyAwareSupportReply } from "../services/support/policy-aware-support.service";
import { sendGeneratedSupportEmail } from "../services/support/supportEmail.service";
import { processRefundSupportEmail } from "../services/refund/refund.service";

const router = Router();
const resend = new Resend(env.email.resend.apiKey);
const chatSchema = z.object({ message: z.string().trim().min(1).max(12_000), caseNumber: z.string().trim().regex(/^R\d{11}$/i).optional() });
function extractEmailAddress(value: string): string { const angle = value.match(/<([^>]+)>/); if (angle?.[1]) return angle[1].trim().toLowerCase(); const plain = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); return plain?.[0]?.toLowerCase() ?? value.trim().toLowerCase(); }
function extractEmailDisplayName(value: string): string | null { const angle = value.match(/^\s*["']?(.+?)["']?\s*<[^>]+>\s*$/); if (!angle?.[1]) return null; const name = angle[1].trim().replace(/^['"]|['"]$/g, "").trim(); return name && !/@/.test(name) ? name : null; }
function stripHtml(value: string): string { return value.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(); }
function emailBody(email: { text?: string | null; html?: string | null }): string { return email.text?.trim() || (email.html ? stripHtml(email.html) : ""); }
function applySenderGreeting(reply: string, senderName?: string | null): string { if (!senderName) return reply.trim(); const normalized = reply.trim(); const greeting = `Hello ${senderName},`; return normalized.replace(/^hello(?:\s+[^,\n]{1,120})?,\s*/i, `${greeting}\n\n`).replace(/^hi(?:\s+[^,\n]{1,120})?,\s*/i, `${greeting}\n\n`); }

async function resolveCaseForMessage(input: { userId?: string | null; senderEmail: string; message: string; subject?: string | null; caseNumber?: string | null }): Promise<{ supportCase: SupportCase; closedCaseNumber?: string }> {
  const referenced = input.caseNumber || extractCaseNumber(`${input.subject ?? ""}\n${input.message}`);
  if (referenced) {
    const existing = input.userId ? await getOwnedSupportCase(input.userId, referenced) : await getSupportCase(referenced);
    if (existing) {
      const requester = await getCaseRequesterEmail(existing.id);
      const senderMatches = !requester || requester.toLowerCase() === input.senderEmail.toLowerCase();
      if (senderMatches && existing.status !== "closed") return { supportCase: existing };
      if (senderMatches && existing.status === "closed") return { supportCase: await createSupportCase({ userId: input.userId, requesterEmail: input.senderEmail, subject: input.subject, category: classifySupportCategory(input.message) }), closedCaseNumber: existing.caseNumber };
    }
  }
  return { supportCase: await createSupportCase({ userId: input.userId, requesterEmail: input.senderEmail, subject: input.subject, category: classifySupportCategory(input.message) }) };
}

async function processSupportMessage(input: { message: string; userId?: string | null; senderEmail: string; senderDisplayName?: string | null; subject?: string | null; caseNumber?: string | null }): Promise<{ supportCase: SupportCase; isSafe: boolean; reply: string | null }> {
  const { supportCase, closedCaseNumber } = await resolveCaseForMessage(input);
  await addSupportMessage({ caseId: supportCase.id, senderType: "user", senderEmail: input.senderEmail, body: input.message });
  if (closedCaseNumber) {
    const reply = `This support case has been permanently closed and cannot be reopened. If you're experiencing a new issue, please create a new support case. For your security, closed case numbers cannot be reused.\n\nA new support case has been created for this message.\n\nCase Number: ${supportCase.caseNumber}`;
    await addSupportMessage({ caseId: supportCase.id, senderType: "ai", senderEmail: env.email.supportFrom, body: reply });
    return { supportCase, isSafe: true, reply };
  }
  const account = input.userId ? await getAccountContextById(input.userId) : await getAccountContextByEmail(input.senderEmail);
  const history = await getSupportCaseMessages(supportCase.id, 20);
  const aiResult = await generatePolicyAwareSupportReply({ message: input.message, subject: input.subject, account, supportCase, history });
  if (!aiResult.is_safe || aiResult.support_reply === null) return { supportCase, isSafe: false, reply: null };
  const reply = formatCaseReply(supportCase.caseNumber, applySenderGreeting(aiResult.support_reply, input.senderDisplayName));
  await addSupportMessage({ caseId: supportCase.id, senderType: "ai", senderEmail: env.email.supportFrom, body: reply });
  return { supportCase, isSafe: true, reply };
}

router.post("/chat", authMiddleware, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid support request." });
  try {
    const result = await processSupportMessage({ message: parsed.data.message, userId: req.user!.userId, senderEmail: "authenticated-in-app-user", caseNumber: parsed.data.caseNumber });
    if (!result.isSafe) return res.status(200).json({ success: true, is_safe: false, support_reply: null, caseNumber: result.supportCase.caseNumber });
    return res.status(200).json({ success: true, is_safe: true, support_reply: result.reply, caseNumber: result.supportCase.caseNumber, status: result.supportCase.status });
  } catch (error) { req.log?.error?.({ err: error }, "In-app support processing failed"); return res.status(502).json({ success: false, message: "ReDom Support is temporarily unavailable. Please try again shortly." }); }
});
router.post("/payment-problem", authMiddleware, async (req, res) => {
  const parsed = z.object({
    transactionKey: z.string().trim().min(3).max(100),
    transactionNumber: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(320),
    description: z.string().trim().min(1).max(4000),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid problem description, email address, and transaction number." });

  try {
    const key = parsed.data.transactionKey;
    const split = key.indexOf(":");
    if (split <= 0) return res.status(400).json({ success: false, message: "Invalid transaction reference." });
    const kind = key.slice(0, split);
    const id = key.slice(split + 1);

    let transaction: any = null;
    if (kind === "payment") {
      const result = await pool.query(
        `SELECT pt.id, pt.reference, pt.redom_transaction_id, pt.amount_minor, pt.currency, pt.purpose,
                pt.status, pt.refund_status, pt.created_at, pt.paid_at, pt.metadata, pp.name AS plan_name
           FROM payment_transactions pt
           LEFT JOIN payment_plans pp ON pp.id = pt.plan_id
          WHERE pt.id = $1 AND pt.user_id = $2
          LIMIT 1`,
        [id, req.user!.userId],
      );
      transaction = result.rows[0] ?? null;
    } else if (kind === "order") {
      const result = await pool.query(
        `SELECT mt.id, mt.transaction_id, ml.title, mt.total_price, mt.currency, mt.payment_method,
                mt.payment_provider, mt.payment_status, mt.order_status, mt.created_at, mt.paid_at, mt.transaction_reference
           FROM marketplace_transactions mt
           JOIN marketplace_listings ml ON ml.id = mt.listing_id
           JOIN user_profiles up ON up.id = mt.buyer_user_id
          WHERE mt.id = $1 AND up.user_id = $2
          LIMIT 1`,
        [id, req.user!.userId],
      );
      transaction = result.rows[0] ?? null;
    }
    if (!transaction) return res.status(404).json({ success: false, message: "Transaction not found." });

    const caseRecord = await createSupportCase({
      userId: req.user!.userId,
      requesterEmail: parsed.data.email,
      subject: `ReDom Pay transaction problem — ${parsed.data.transactionNumber}`,
      category: "payment_transaction_problem",
    });

    const account = await getAccountContextById(req.user!.userId);
    const accountName = [account?.firstName, account?.lastName].filter(Boolean).join(" ").trim() || "ReDom user";
    const rawMetadata = transaction.metadata;
    let metadata: any = {};
    try { metadata = rawMetadata ? (typeof rawMetadata === "string" ? JSON.parse(rawMetadata) : rawMetadata) : {}; } catch { metadata = {}; }

    const amount = kind === "payment" ? String(transaction.amount_minor) : String(Math.round(Number(transaction.total_price) * 100));
    const currency = String(transaction.currency);
    const product = kind === "payment"
      ? (transaction.plan_name ? String(transaction.plan_name) : transaction.purpose === "stars_purchase" ? "ReDom Stars" : String(transaction.purpose || "ReDom payment").replaceAll("_", " "))
      : String(transaction.title);

    const supportBody = [
      "ReDom Pay transaction problem report",
      "",
      `Account: ${accountName}`,
      `User ID: ${req.user!.userId}`,
      `Submitted email: ${parsed.data.email}`,
      `Transaction number: ${parsed.data.transactionNumber}`,
      `ReDom transaction ID: ${kind === "payment" ? String(transaction.redom_transaction_id ?? "") : "Marketplace order " + String(transaction.transaction_id)}`,
      `Product: ${product}`,
      `Status: ${kind === "payment" ? String(transaction.refund_status || transaction.status) : String(transaction.payment_status || transaction.order_status)}`,
      `Amount minor: ${amount}`,
      `Currency: ${currency}`,
      `Payment method: ${kind === "payment" ? String(metadata?.paymentDetails?.channel ?? metadata?.preferredChannel ?? "not recorded") : String(transaction.payment_method ?? "not recorded")}`,
      `Provider: ${kind === "payment" ? String(metadata?.paymentDetails?.provider ?? metadata?.provider ?? "not recorded") : String(transaction.payment_provider ?? "not recorded")}`,
      "",
      "Problem description:",
      parsed.data.description,
      "",
      `Support case: ${caseRecord.caseNumber}`,
    ].join("\n");

    await addSupportMessage({ caseId: caseRecord.id, senderType: "user", senderEmail: parsed.data.email, body: parsed.data.description });

    const safe = (value: string) => value.replace(/[&<>"]/g, (ch) => { if (ch === "&") return "&amp;"; if (ch === "<") return "&lt;"; if (ch === ">") return "&gt;"; return "&quot;"; });\n/g, "<br>")}</p></body></html>`;
    const { error } = await resend.emails.send({
      from: env.email.supportFrom,
      to: [env.email.supportFrom],
      replyTo: parsed.data.email,
      subject: `ReDom Pay Transaction Problem — ${parsed.data.transactionNumber} — Case ${caseRecord.caseNumber}`,
      text: supportBody,
      html,
    });
    if (error) throw new Error(error.message);

    return res.status(201).json({ success: true, caseNumber: caseRecord.caseNumber });
  } catch (error) {
    req.log?.error?.({ err: error }, "ReDom Pay transaction problem report failed");
    return res.status(500).json({ success: false, message: "Unable to submit the transaction problem report. Please try again." });
  }
});

router.post("/feedback", authMiddleware, async (req, res) => {
  const parsed = z.object({ topic: z.string().trim().min(1).max(300), helpful: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid feedback." });
  try {
    await pool.query(`INSERT INTO support_feedback (user_id, topic, helpful) VALUES ($1, $2, $3)`, [req.user!.userId, parsed.data.topic, parsed.data.helpful]);
    return res.status(201).json({ success: true });
  } catch (error) {
    req.log?.error?.({ err: error }, "Support feedback save failed");
    return res.status(500).json({ success: false, message: "Unable to save feedback." });
  }
});
router.get("/cases", authMiddleware, async (req, res) => { try { return res.status(200).json({ success: true, cases: await listOwnedSupportCases(req.user!.userId) }); } catch (error) { req.log?.error?.({ err: error }, "Support case list failed"); return res.status(500).json({ success: false, message: "Unable to load your support history." }); } });
router.get("/cases/:caseNumber", authMiddleware, async (req, res) => { const caseNumber = String(req.params.caseNumber).toUpperCase(); if (!/^R\d{11}$/.test(caseNumber)) return res.status(400).json({ success: false, message: "Invalid Case Number." }); try { const supportCase = await getOwnedSupportCase(req.user!.userId, caseNumber); if (!supportCase) return res.status(404).json({ success: false, message: "Support case not found." }); return res.status(200).json({ success: true, case: supportCase, messages: await getSupportCaseMessages(supportCase.id, 50) }); } catch (error) { req.log?.error?.({ err: error }, "Support case read failed"); return res.status(500).json({ success: false, message: "Unable to load this support case." }); } });

router.post("/email/webhook", async (req, res) => {
  if (!env.email.resend.webhookSecret) return res.status(503).send("Support email webhook is not configured.");
  try {
    const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
    const id = String(req.headers["svix-id"] ?? ""), timestamp = String(req.headers["svix-timestamp"] ?? ""), signature = String(req.headers["svix-signature"] ?? "");
    if (!id || !timestamp || !signature) return res.status(400).send("Missing webhook signature headers.");
    const event = resend.webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret: env.email.resend.webhookSecret });
    if (event.type !== "email.received") return res.status(200).json({ received: true });

    // Do not mark the event as complete until the entire support pipeline succeeds.
    // If Gemini/Resend temporarily fails, Resend can retry the webhook and the message will be processed again.
    const emailId = event.data.email_id;
    const { data: email, error } = await resend.emails.receiving.get(emailId);
    if (error || !email) throw new Error(error?.message || "Inbound email could not be retrieved.");
    const senderEmail = extractEmailAddress(email.from ?? "");
    const senderDisplayName = extractEmailDisplayName(email.from ?? "");
    const supportAddress = env.email.supportFrom.toLowerCase();
    if (!senderEmail || senderEmail === supportAddress || senderEmail === "noreply@wnncompany.com") return res.status(200).json({ received: true, ignored: true });
    const message = emailBody(email); if (!message) return res.status(200).json({ received: true, ignored: true });
    const looksLikeRefund = /\b(refund|refunds|money back|return (?:my|the) (?:payment|money)|charged in error)\b/i.test(`${email.subject ?? ""}\n${message}`);
    if (looksLikeRefund) {
      const referenced = extractCaseNumber(`${email.subject ?? ""}\n${message}`);
      const refundResult = await processRefundSupportEmail({senderEmail,message,subject:String(email.subject ?? "Refund Request"),caseNumber:referenced});
      if (refundResult.caseNumber) {
        const refundCase = await getSupportCase(refundResult.caseNumber);
        if (refundCase) await linkInboundEvent(id, refundCase.id);
      }
      await markInboundEvent(id, emailId);
      return res.status(200).json({ received: true, caseNumber: refundResult.caseNumber, refund: true });
    }
    const account = await getAccountContextByEmail(senderEmail); const referenced = extractCaseNumber(`${email.subject ?? ""}\n${message}`);
    const result = await processSupportMessage({ message, userId: account?.userId ?? null, senderEmail, senderDisplayName, subject: email.subject ?? "ReDom Support", caseNumber: referenced });
    if (result.isSafe && result.reply) { const baseSubject = String(email.subject || "ReDom Support").replace(/^\s*((re|fwd|fw):\s*)+/i, "").replace(/\s*\[?Case\s*R\d{11}\]?\s*$/i, "").trim() || "ReDom Support"; await sendGeneratedSupportEmail({ to: senderEmail, subject: `Re: ${baseSubject} [Case ${result.supportCase.caseNumber}]`, caseNumber: result.supportCase.caseNumber, category: result.supportCase.category, supportReply: result.reply }); }
    await linkInboundEvent(id, result.supportCase.id);
    await markInboundEvent(id, emailId);
    return res.status(200).json({ received: true, caseNumber: result.supportCase.caseNumber, is_safe: result.isSafe });
  } catch (error) { req.log?.error?.({ err: error }, "Support email webhook failed"); return res.status(500).send("Support email processing failed."); }
});
export default router;
