import { Router, type Response } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { REFUND_FEATURE_ENABLED } from "../services/refund/refund.service";

const router = Router();

const transactionSchema = z.object({
  transactionNumber: z.string().trim().min(1).max(120),
});

const accountProfileSchema = z.object({
  refundRequestId: z.string().uuid(),
  accountProfileId: z.string().trim().min(1).max(64),
});

const verificationSchema = z.object({
  refundRequestId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});

function unavailable(res: Response) {
  return res.status(503).json({
    success: false,
    code: "REFUNDS_NOT_AVAILABLE",
    message: "ReDom refunds are not currently available. This refund workflow is reserved for future product requirements.",
  });
}

router.post("/request", authMiddleware, async (_req, res) => {
  if (!REFUND_FEATURE_ENABLED) return unavailable(res);
  return res.status(501).json({ success: false, code: "REFUND_WORKFLOW_PENDING_IMPLEMENTATION" });
});

// Contract endpoint reserved for the future transaction-number step.
router.post("/transaction", authMiddleware, async (req, res) => {
  const parsed = transactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid transaction number." });
  if (!REFUND_FEATURE_ENABLED) return unavailable(res);
  return res.status(501).json({ success: false, code: "REFUND_WORKFLOW_PENDING_IMPLEMENTATION" });
});

// Contract endpoint reserved for the future Account Profile ID step.
router.post("/account-profile", authMiddleware, async (req, res) => {
  const parsed = accountProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid Account Profile ID." });
  if (!REFUND_FEATURE_ENABLED) return unavailable(res);
  return res.status(501).json({ success: false, code: "REFUND_WORKFLOW_PENDING_IMPLEMENTATION" });
});

// Contract endpoint reserved for the future linked-email/phone verification step.
router.post("/verify-code", authMiddleware, async (req, res) => {
  const parsed = verificationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid verification code." });
  if (!REFUND_FEATURE_ENABLED) return unavailable(res);
  return res.status(501).json({ success: false, code: "REFUND_WORKFLOW_PENDING_IMPLEMENTATION" });
});

export default router;
