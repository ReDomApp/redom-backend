import { Router } from "express";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "../config/env";
import { pool } from "../database/db";
import { authMiddleware } from "../middleware/auth.middleware";
import { addSupportMessage, classifySupportCategory, createSupportCase, extractCaseNumber, formatCaseReply, getAccountContextByEmail, getAccountContextById, getCaseRequesterEmail, getOwnedSupportCase, getSupportCase, getSupportCaseMessages, linkInboundEvent, listOwnedSupportCases, claimInboundEvent, markInboundEvent, markInboundEventFailed, findRecentActiveSupportCase, sendSupportEmail, type SupportCase } from "../services/support/support.service";
import { generatePolicyAwareSupportReply } from "../services/support/policy-aware-support.service";
import { sendGeneratedSupportEmail } from "../services/support/supportEmail.service";
import { processRefundSupportEmail } from "../services/refund/refund.service";
import { buildSupportEmailActions } from "../services/support/supportWebLinks.service";

const router = Router();
const resend = new Resend(env.email.resend.apiKey);
const chatSchema = z.object({ message: z.string().trim().min(1).max(12_000), caseNumber: z.string().trim().regex(/^R\d{11}$/i).optional() });
function extractEmailAddress(value: string): string { const angle = value.match(/<([^>]+)>/); if (angle?.[1]) return angle[1].trim().toLowerCase(); const plain = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); return plain?.[0]?.toLowerCase() ?? value.trim().toLowerCase(); }
function extractEmailDisplayName(value: string): string | null { const angle = value.match(/^\s*["']?(.+?)["']?\s*<[^>]+>\s*$/); if (!angle?.[1]) return null; const name = angle[1].trim().replace(/^['"]|['"]$/g, "").trim(); return name && !/@/.test(name) ? name : null; }
function stripHtml(value: string): string { return value.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(); }
function emailBody(email: { text?: string | null; html?: string | null }): string { return email.text?.trim() || (email.html ? stripHtml(email.html) : ""); }
function isAutomaticSupportResponse(email: any, message: string): boolean {
  const headers = email?.headers && typeof email.headers === "object" ? email.headers as Record<string, unknown> : {};
  const header = (name: string): string => {
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    const value = key ? headers[key] : undefined;
    return Array.isArray(value) ? value.join(", ") : String(value ?? "");
  };
  const autoSubmitted = header("auto-submitted").trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (/^(?:list|bulk|junk)$/i.test(header("precedence").trim())) return true;
  if (header("x-autorespond") || header("x-autoreply") || header("x-autoreply-from")) return true;

  const subject = String(email?.subject ?? "");
  const body = String(message ?? "");
  // Common helpdesk/transactional auto-replies must never become a new support conversation.
  if (/^\s*(?:auto(?:matic)?\s+(?:reply|response)|out of office|vacation reply)\s*:/i.test(subject)) return true;
  if (/your request\s*\(\d+\)\s+has been received and is being reviewed/i.test(body)) return true;
  if (/this is an automated (?:message|response)|do not reply to this (?:email|message)/i.test(body)) return true;
  return false;
}
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

async function processSupportMessage(input: { message: string; userId?: string | null; senderEmail: string; senderDisplayName?: string | null; subject?: string | null; caseNumber?: string | null }): Promise<{ supportCase: SupportCase; isSafe: boolean; reply: string | null; actions: Awaited<ReturnType<typeof buildSupportEmailActions>>; duplicate?: boolean }> {
  const referenced = input.caseNumber || extractCaseNumber(`${input.subject ?? ""}\n${input.message}`);
  if (!referenced) {
    const duplicateCase = await findRecentActiveSupportCase({
      userId: input.userId ?? null,
      requesterEmail: input.senderEmail,
      message: input.message,
    });
    if (duplicateCase) {
      const recentMessages = await getSupportCaseMessages(duplicateCase.id, 20);
      const previousReply = [...recentMessages].reverse().find((message) => message.senderType === "ai")?.body ?? null;
      return {
        supportCase: duplicateCase,
        isSafe: true,
        reply: previousReply,
        actions: [],
        duplicate: true,
      };
    }
  }

  const { supportCase, closedCaseNumber } = await resolveCaseForMessage(input);
  await addSupportMessage({ caseId: supportCase.id, senderType: "user", senderEmail: input.senderEmail, body: input.message });
  if (closedCaseNumber) {
    const reply = `This support case has been permanently closed and cannot be reopened. If you're experiencing a new issue, please create a new support case. For your security, closed case numbers cannot be reused.\n\nA new support case has been created for this message.\n\nCase Number: ${supportCase.caseNumber}`;
    await addSupportMessage({ caseId: supportCase.id, senderType: "ai", senderEmail: env.email.supportFrom, body: reply });
    const account = input.userId ? await getAccountContextById(input.userId) : await getAccountContextByEmail(input.senderEmail);
    const actions = await buildSupportEmailActions({ account, message: input.message, category: supportCase.category, caseNumber: supportCase.caseNumber });
    return { supportCase, isSafe: true, reply, actions };
  }
  const account = input.userId ? await getAccountContextById(input.userId) : await getAccountContextByEmail(input.senderEmail);
  const history = await getSupportCaseMessages(supportCase.id, 20);
  const aiResult = await generatePolicyAwareSupportReply({ message: input.message, subject: input.subject, account, supportCase, history });
  if (!aiResult.is_safe || aiResult.support_reply === null) return { supportCase, isSafe: false, reply: null, actions: [] };
  const reply = formatCaseReply(supportCase.caseNumber, applySenderGreeting(aiResult.support_reply, input.senderDisplayName));
  await addSupportMessage({ caseId: supportCase.id, senderType: "ai", senderEmail: env.email.supportFrom, body: reply });
  const actions = await buildSupportEmailActions({ account, message: input.message, category: supportCase.category, caseNumber: supportCase.caseNumber, policySlug: aiResult.policySlug });
  return { supportCase, isSafe: true, reply, actions };
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
    transactionKey: z.string().trim().min(3).max(100).optional(),
    transactionNumber: z.string().trim().min(1).max(100).optional(),
    paymentMethodId: z.string().uuid().optional(),
    email: z.string().trim().email().max(320).optional(),
    description: z.string().trim().min(1).max(4000),
  }).refine((value) => Boolean(value.paymentMethodId || (value.transactionKey && value.transactionNumber)), "A payment method or transaction reference is required.").safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid problem description, email address, and transaction number." });

  try {
    if (parsed.data.paymentMethodId) {
      const method = await pool.query(
        "SELECT id,provider,brand,last4,country_code,status,reusable,stripe_payment_method_id FROM redom_payment_methods WHERE id=$1 AND user_id=$2 AND active=true LIMIT 1",
        [parsed.data.paymentMethodId, req.user!.userId],
      );
      if (!method.rows[0]) return res.status(404).json({ success: false, message: "Payment method not found." });
      const account = await getAccountContextById(req.user!.userId);
      const connectedEmail = account?.email || parsed.data.email;
      if (!connectedEmail) return res.status(400).json({ success: false, message: "A connected ReDom email address is required." });
      const caseRecord = await createSupportCase({
        userId: req.user!.userId,
        requesterEmail: connectedEmail,
        subject: "ReDom Pay payment method problem",
        category: "payment_method_problem",
      });
      const row = method.rows[0];
      const supportBody = [
        "ReDom Pay payment method problem report",
        "",
        "User ID: " + req.user!.userId,
        "Connected email: " + connectedEmail,
        "Payment method ID: " + String(row.id),
        "Provider: " + String(row.provider || "stripe"),
        "Card brand: " + String(row.brand || "not recorded"),
        "Last four: " + String(row.last4 || "not recorded"),
        "Country: " + String(row.country_code || "not recorded"),
        "Status: " + String(row.status || "unknown"),
        "Reusable: " + String(Boolean(row.reusable)),
        "Stripe payment-method identifier: " + String(row.stripe_payment_method_id || "not recorded"),
        "",
        "Problem description:",
        parsed.data.description,
        "",
        "Support case: " + caseRecord.caseNumber,
        "Security note: No raw PAN or CVC/CVV is included in this report.",
      ].join("\n");
      await addSupportMessage({ caseId: caseRecord.id, senderType: "user", senderEmail: connectedEmail, body: parsed.data.description });
      const safe = (value: string) => value.replace(/[&<>"]/g, (ch) => ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&quot;");
      const html = "<!doctype html><html><body style=\"font-family:Arial,sans-serif;color:#1c1e21\"><h2>ReDom Pay payment method problem</h2><p><strong>Case:</strong> "+safe(caseRecord.caseNumber)+"</p><p><strong>Payment method:</strong> "+safe(String(row.provider||"stripe"))+" / "+safe(String(row.brand||"card"))+"-****"+safe(String(row.last4||""))+"</p><p><strong>Country:</strong> "+safe(String(row.country_code||"not recorded"))+"</p><p><strong>Status:</strong> "+safe(String(row.status||"unknown"))+"</p><p><strong>Problem:</strong> "+safe(parsed.data.description).replace(/\\n/g,"<br>")+"</p><p><strong>Security:</strong> No raw PAN or CVC/CVV included.</p></body></html>";
      const { error } = await resend.emails.send({
        from: env.email.supportFrom,
        to: [env.email.supportFrom],
        replyTo: connectedEmail,
        subject: "ReDom Pay Payment Method Problem — Case " + caseRecord.caseNumber,
        text: supportBody,
        html,
      });
      if (error) throw new Error(error.message);
      return res.status(201).json({ success: true, caseNumber: caseRecord.caseNumber });
    }
    const key = parsed.data.transactionKey!;
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

    const safe = (value: string) => value.replace(/[&<>"]/g, (ch) => { if (ch === "&") return "&amp;"; if (ch === "<") return "&lt;"; if (ch === ">") return "&gt;"; return "&quot;"; });
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1c1e21"><h2>ReDom Pay transaction problem</h2><p><strong>Case:</strong> ${safe(caseRecord.caseNumber)}</p><p><strong>Submitted email:</strong> ${safe(parsed.data.email)}</p><p><strong>Transaction:</strong> ${safe(parsed.data.transactionNumber)}</p><p><strong>ReDom transaction ID:</strong> ${safe(kind === "payment" ? String(transaction.redom_transaction_id ?? "") : String(transaction.transaction_id))}</p><p><strong>Product:</strong> ${safe(product)}</p><p><strong>Status:</strong> ${safe(kind === "payment" ? String(transaction.refund_status || transaction.status) : String(transaction.payment_status || transaction.order_status))}</p><p><strong>Amount:</strong> ${safe(amount)} minor units ${safe(currency)}</p><p><strong>Payment method:</strong> ${safe(kind === "payment" ? String(metadata?.paymentDetails?.channel ?? metadata?.preferredChannel ?? "not recorded") : String(transaction.payment_method ?? "not recorded"))}</p><hr><p><strong>Problem description</strong></p><p>${safe(parsed.data.description).replace(/\\n/g, "<br>")}</p></body></html>`;
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

  let inboundSvixId = "";
  let inboundEmailId = "";
  let claimed = false;
  try {
    const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
    const id = String(req.headers["svix-id"] ?? "");
    const timestamp = String(req.headers["svix-timestamp"] ?? "");
    const signature = String(req.headers["svix-signature"] ?? "");
    inboundSvixId = id;
    if (!id || !timestamp || !signature) return res.status(400).send("Missing webhook signature headers.");

    const event = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: env.email.resend.webhookSecret,
    });
    if (event.type !== "email.received") return res.status(200).json({ received: true });

    inboundEmailId = String(event.data.email_id);
    const claim = await claimInboundEvent(id, inboundEmailId);
    if (claim === "processed" || claim === "processing") {
      return res.status(200).json({ received: true, duplicate: true, processing: claim === "processing" });
    }
    claimed = true;

    const { data: email, error } = await resend.emails.receiving.get(inboundEmailId);
    if (error || !email) throw new Error(error?.message || "Inbound email could not be retrieved.");

    const senderEmail = extractEmailAddress(email.from ?? "");
    const senderDisplayName = extractEmailDisplayName(email.from ?? "");
    const supportAddress = env.email.supportFrom.toLowerCase();
    if (!senderEmail || senderEmail === supportAddress || senderEmail === "noreply@wnncompany.com") {
      await markInboundEvent(id, inboundEmailId);
      return res.status(200).json({ received: true, ignored: true });
    }

    const message = emailBody(email);
    if (!message) {
      await markInboundEvent(id, inboundEmailId);
      return res.status(200).json({ received: true, ignored: true });
    }
    if (isAutomaticSupportResponse(email, message)) {
      await markInboundEvent(id, inboundEmailId);
      return res.status(200).json({ received: true, ignored: true, automatic: true });
    }

    const refundIntentText = String(email.subject ?? "") + "\n" + message;
    const policyQuestion = /\b(refund|refunds|money back)\b/i.test(refundIntentText)
      && /\b(policy|policies|rule|rules|eligible|eligibility|allowed|terms|conditions|how does|how do|what is|what are|explain|tell me about|information|window|deadline|time limit|requirement|requirements)\b/i.test(refundIntentText)
      && !/\b(?:i want|i need|please|can you|could you|initiate|process|submit|request|claim|file|apply for)\b.{0,45}\b(?:refund|money back)\b/i.test(refundIntentText);
    const clearRefundRequest = /\b(?:i want|i need|please|can you|could you|initiate|process|submit|request|claim|file|apply for|start)\b.{0,55}\b(?:a |the |my )?(?:refund|money back|return my payment)\b/i.test(refundIntentText)
      || /\b(?:refund|return)\s+(?:my|this|the)\s+(?:payment|purchase|transaction|order)\b/i.test(refundIntentText)
      || /\b(?:please refund|refund me|i am requesting a refund|i'm requesting a refund)\b/i.test(refundIntentText);

    // Policy questions are informational, not refund applications. Never create a case here.
    if (policyQuestion) {
      const now = new Date().toISOString();
      const policyAccount = await getAccountContextByEmail(senderEmail);
      const policyResult = await generatePolicyAwareSupportReply({
        message,
        subject: String(email.subject ?? "Refund Policy Question"),
        account: policyAccount,
        // A non-persisted context object lets the existing policy engine answer from
        // approved policy documents without inserting a support/refund case.
        supportCase: {
          id: "policy-only-no-persist",
          caseNumber: "R00000000000",
          userId: policyAccount?.userId ?? null,
          requesterEmail: senderEmail,
          subject: String(email.subject ?? "Refund Policy Question"),
          category: "refund_payment",
          status: "awaiting_support",
          reminderSentAt: null,
          lastUserMessageAt: now,
          lastAiMessageAt: null,
          closedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        history: [],
      });
      const policyReply = policyResult.is_safe && policyResult.support_reply
        ? policyResult.support_reply
        : "I can explain ReDom's refund rules, but I don't want to guess at policy details. Please tell me which part you want clarified: eligibility, deadlines, or the review process. Asking about policy does not create a refund case. If you want to request a refund, say so explicitly and we will guide you through transaction and account verification.";
      await sendSupportEmail(
        senderEmail,
        "ReDom Refund Policy Information",
        policyReply + "\n\nNo refund case has been created and no refund has been initiated. For your security, never email passwords, one-time verification codes, full card numbers, or CVV/CVC."
      );
      await markInboundEvent(id, inboundEmailId);
      return res.status(200).json({ received: true, refundPolicyQuestion: true, caseCreated: false });
    }

    // A bare mention is not authorization to start the refund workflow.
    if (/\b(refund|refunds|money back|return (?:my|the) (?:payment|money))\b/i.test(refundIntentText) && !clearRefundRequest) {
      await sendSupportEmail(
        senderEmail,
        "Clarification Needed — ReDom Refund Support",
        "I can help with either of these, but I don't want to open a refund case unless that is what you intend.\n\n1. Refund policy or rules: ask your question and I will explain the applicable policy.\n2. Request a refund: reply clearly, \"I want to request a refund.\" Only then will we begin the refund-request workflow and ask for the transaction details needed to verify it.\n\nNo refund case has been created, and no refund has been initiated. For your security, do not email passwords, one-time verification codes, full card numbers, or CVV/CVC."
      );
      await markInboundEvent(id, inboundEmailId);
      return res.status(200).json({ received: true, refundIntentClarification: true, caseCreated: false });
    }

    if (clearRefundRequest) {
      const referenced = extractCaseNumber(refundIntentText);
      const refundResult = await processRefundSupportEmail({
        senderEmail,
        message,
        subject: String(email.subject ?? "Refund Request"),
        caseNumber: referenced,
      });
      if (refundResult.caseNumber) {
        const refundCase = await getSupportCase(refundResult.caseNumber);
        if (refundCase) await linkInboundEvent(id, refundCase.id);
      }
      await markInboundEvent(id, inboundEmailId);
      return res.status(200).json({ received: true, caseNumber: refundResult.caseNumber, refund: true, explicitIntent: true });
    }

    const account = await getAccountContextByEmail(senderEmail);
    const referenced = extractCaseNumber(`${email.subject ?? ""}\n${message}`);
    const result = await processSupportMessage({
      message,
      userId: account?.userId ?? null,
      senderEmail,
      senderDisplayName,
      subject: email.subject ?? "ReDom Support",
      caseNumber: referenced,
    });

    if (result.isSafe && result.reply && !result.duplicate) {
      const baseSubject = String(email.subject || "ReDom Support")
        .replace(/^\s*((re|fwd|fw):\s*)+/i, "")
        .replace(/\s*\[?Case\s*R\d{11}\]?\s*$/i, "")
        .trim() || "ReDom Support";
      await sendGeneratedSupportEmail({
        to: senderEmail,
        subject: `Re: ${baseSubject} [Case ${result.supportCase.caseNumber}]`,
        caseNumber: result.supportCase.caseNumber,
        category: result.supportCase.category,
        supportReply: result.reply,
        actions: result.actions,
        idempotencyKey: `support-reply/${inboundEmailId}`,
        inReplyToMessageId: typeof (email as any).message_id === "string" ? (email as any).message_id : null,
      });
    }

    await linkInboundEvent(id, result.supportCase.id);
    await markInboundEvent(id, inboundEmailId);
    return res.status(200).json({
      received: true,
      caseNumber: result.supportCase.caseNumber,
      is_safe: result.isSafe,
      duplicate: Boolean(result.duplicate),
    });
  } catch (error) {
    if (claimed && inboundSvixId && inboundEmailId) {
      await markInboundEventFailed(inboundSvixId, inboundEmailId, error instanceof Error ? error.message : String(error)).catch(() => undefined);
    }
    req.log?.error?.({ err: error, emailId: inboundEmailId }, "Support email webhook failed");
    return res.status(500).send("Support email processing failed.");
  }
});
export default router;
