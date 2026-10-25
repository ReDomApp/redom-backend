import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { authMiddleware } from "../middleware/auth.middleware";
import {
  generateInternalAiReply,
  getInternalAiStatus,
  InternalAiConfigurationError,
  InternalAiUnavailableError,
} from "../services/internal-ai/internal-ai.service";

const router = Router();

const internalAiRateLimit = rateLimit({
  windowMs: 60_000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId ?? req.ip ?? "unknown",
  message: { success: false, message: "Too many Internal AI requests. Please try again shortly." },
});

const chatSchema = z.object({
  message: z.string().trim().min(1).max(8_000),
  language: z.string().trim().min(2).max(64).optional(),
}).strict();

// This endpoint reports configuration only; it never exposes the private runtime URL or token.
router.get("/status", authMiddleware, (_req, res) => {
  const status = getInternalAiStatus();
  return res.status(200).json({ success: true, internalAi: status });
});

router.post("/chat", authMiddleware, internalAiRateLimit, async (req, res) => {
  if (!req.user?.userId) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }

  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid Internal AI request.",
      errors: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  try {
    const result = await generateInternalAiReply({
      userId: req.user.userId,
      message: parsed.data.message,
      language: parsed.data.language,
    });
    return res.status(200).json({
      success: true,
      reply: result.reply,
      model: result.model,
      requestId: result.requestId,
    });
  } catch (error) {
    if (error instanceof InternalAiConfigurationError) {
      return res.status(503).json({
        success: false,
        code: "INTERNAL_AI_NOT_CONFIGURED",
        message: "ReDom Internal AI is not configured yet.",
      });
    }
    if (error instanceof InternalAiUnavailableError) {
      return res.status(502).json({
        success: false,
        code: "INTERNAL_AI_UNAVAILABLE",
        message: error.message,
      });
    }
    return res.status(502).json({
      success: false,
      code: "INTERNAL_AI_UNAVAILABLE",
      message: "ReDom Internal AI could not complete the request.",
    });
  }
});

export default router;
