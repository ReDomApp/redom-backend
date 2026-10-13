import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { env } from "../config/env";
import { logger } from "../lib/logger";

const router = Router();

function isValidMetaSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const secret = env.whatsappCloud.appSecret;
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;
  const suppliedHex = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const supplied = Buffer.from(suppliedHex, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

router.get("/whatsapp/webhook", (req: Request, res: Response) => {
  const verifyToken = env.whatsappCloud.verifyToken;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && verifyToken && token === verifyToken && typeof challenge === "string") {
    res.status(200).type("text/plain").send(challenge);
    return;
  }
  res.sendStatus(403);
});

router.post("/whatsapp/webhook", (req: Request, res: Response) => {
  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ success: false, message: "Expected raw webhook body." });
    return;
  }
  if (!isValidMetaSignature(req.body, req.header("x-hub-signature-256"))) {
    res.status(401).json({ success: false, message: "Invalid webhook signature." });
    return;
  }

  try {
    const event = JSON.parse(req.body.toString("utf8")) as {
      object?: string;
      entry?: Array<{ changes?: Array<{ field?: string; value?: { messages?: Array<{ id?: string; from?: string; type?: string }>; statuses?: Array<{ id?: string; status?: string }> } }> }>;
    };
    if (event.object !== "whatsapp_business_account") {
      res.sendStatus(404);
      return;
    }
    // Keep PII and message content out of logs. Meta expects a quick 200 acknowledgement.
    const counts = (event.entry ?? []).flatMap((entry) => entry.changes ?? []).map((change) => ({
      field: change.field ?? "unknown",
      inboundMessages: change.value?.messages?.length ?? 0,
      deliveryStatuses: change.value?.statuses?.length ?? 0,
    }));
    logger.info({ webhook: "meta-whatsapp", changes: counts }, "Meta WhatsApp webhook received");
    res.sendStatus(200);
  } catch {
    res.status(400).json({ success: false, message: "Invalid webhook JSON." });
  }
});

router.get("/whatsapp/cloud/status", (_req: Request, res: Response) => {
  res.json({
    success: true,
    provider: "meta-whatsapp-cloud-api",
    configured: Boolean(env.whatsappCloud.accessToken && env.whatsappCloud.phoneNumberId),
    webhookVerificationConfigured: Boolean(env.whatsappCloud.verifyToken && env.whatsappCloud.appSecret),
    otpTemplateName: env.whatsappCloud.otpTemplateName,
  });
});

export default router;
