import { Router, type Request, type Response, type NextFunction } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";
import { recordOpsEmailEvent } from "../services/operations/daily-ops-intelligence.service";
import { pool } from "../database/db";

const router = Router();

function verifyResendWebhook(raw: Buffer, id: string, timestamp: string, signature: string, secret: string): boolean {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret);
  const expected = createHmac("sha256", key).update(id + "." + timestamp + "." + raw.toString("utf8")).digest("base64");
  return signature.split(" ").some((part) => {
    const pieces = part.split(",");
    if (pieces.length !== 2 || pieces[0] !== "v1") return false;
    const supplied = Buffer.from(pieces[1]);
    const calculated = Buffer.from(expected);
    return supplied.length === calculated.length && timingSafeEqual(supplied, calculated);
  });
}

/**
 * Provider callbacks must be authenticated by Resend's signed webhook, not by
 * the private administrator key. Keep this route before the archive guard.
 */
router.post("/email/webhook", async (req, res) => {
  const secret = env.email.resend.webhookSecret;
  if (!secret) return res.status(503).json({ success: false, message: "Resend delivery webhook secret is not configured." });
  if (!Buffer.isBuffer(req.body)) return res.status(400).json({ success: false, message: "Expected raw webhook payload." });
  const id = req.header("svix-id") ?? "";
  const timestamp = req.header("svix-timestamp") ?? "";
  const signature = req.header("svix-signature") ?? "";
  if (!id || !timestamp || !signature || !verifyResendWebhook(req.body, id, timestamp, signature, secret)) {
    return res.status(400).json({ success: false, message: "Invalid webhook signature." });
  }

  let event: any;
  try { event = JSON.parse(req.body.toString("utf8")); } catch { return res.status(400).json({ success: false, message: "Invalid JSON payload." }); }
  const eventType = String(event?.type ?? "");
  const typeMap: Record<string, "accepted" | "delivered" | "deferred" | "bounced" | "rejected" | "failed" | "complained"> = {
    "email.sent": "accepted",
    "email.delivered": "delivered",
    "email.delivery_delayed": "deferred",
    "email.bounced": "bounced",
    "email.rejected": "rejected",
    "email.failed": "failed",
    "email.complained": "complained",
  };
  const mapped = typeMap[eventType];
  const messageId = String(event?.data?.email_id ?? event?.data?.id ?? "");
  if (!mapped || !messageId) return res.status(200).json({ received: true, ignored: true });
  const toValue = event?.data?.to;
  const recipient = Array.isArray(toValue) ? String(toValue[0] ?? "") : String(toValue ?? "");

  try {
    // Provider webhook IDs are unique and idempotent. The ledger insert and
    // report state update are deliberately both retriable.
    await recordOpsEmailEvent({
      logicalEmailId: messageId,
      providerMessageId: messageId,
      subsystem: "resend-webhook",
      eventType: mapped,
      recipient,
      idempotencyKey: "resend-webhook:" + id,
      metadata: { providerEventType: eventType, webhookId: id, createdAt: event?.created_at ?? null },
    });
    if (mapped === "delivered") {
      await pool.query("UPDATE redom_ops_report_runs SET delivery_status='delivered',delivered_at=COALESCE(delivered_at,now()),updated_at=now() WHERE provider_message_id=$1", [messageId]);
    } else if (mapped === "bounced" || mapped === "rejected" || mapped === "failed" || mapped === "complained") {
      await pool.query("UPDATE redom_ops_report_runs SET delivery_status='failed',updated_at=now() WHERE provider_message_id=$1", [messageId]);
    }
    return res.status(200).json({ received: true });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to persist delivery event." });
  }
});

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.REDOM_OPS_ADMIN_KEY;
  const supplied = req.header("x-redom-ops-key") ?? "";
  if (!expected) {
    res.status(503).json({ success: false, message: "Operations report archive is disabled until REDOM_OPS_ADMIN_KEY is configured." });
    return;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (!supplied || a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ success: false, message: "Unauthorized." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
}

router.get("/reports", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(`SELECT report_key, period_start, period_end, timezone, status, delivery_status,
      provider_message_id, pdf_sha256, generated_at, delivered_at, attempt_count, error_message, created_at
      FROM redom_ops_report_runs ORDER BY period_end DESC LIMIT 100`);
    return res.json({ success: true, reports: result.rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve operations reports." });
  }
});

router.get("/reports/:reportKey.pdf", requireAdmin, async (req, res) => {
  const reportKey = String(req.params.reportKey ?? "");
  if (!/^daily-ops-\d{1,12}$/.test(reportKey)) return res.status(400).json({ success: false, message: "Invalid report key." });
  try {
    const result = await pool.query("SELECT period_end, pdf_base64, pdf_sha256 FROM redom_ops_report_runs WHERE report_key=$1 AND pdf_base64 IS NOT NULL LIMIT 1", [reportKey]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ success: false, message: "Report PDF not found." });
    const pdf = Buffer.from(String(row.pdf_base64), "base64");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="ReDom-Daily-Operations-' + new Date(row.period_end).toISOString().slice(0, 10) + '.pdf"');
    res.setHeader("X-Content-SHA256", String(row.pdf_sha256 ?? ""));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(pdf);
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve operations report PDF." });
  }
});

export default router;
