import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { authMiddleware } from "../middleware/auth.middleware";
import { translateUiTexts } from "../services/aiContent.service";
import { generateReDomAiReply } from "../services/reDomAiChat.service";

const router = Router();

const localizationRateLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const localizationSchema = z.object({
  language: z.string().trim().min(2).max(32),
  texts: z.array(z.string().min(1).max(2_000)).min(1).max(100),
  context: z.string().trim().max(500).optional(),
});

const chatSchema = z.object({
  message: z.string().trim().min(1).max(6_000),
  language: z.string().trim().max(64).optional(),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(6_000),
  })).max(20).optional(),
}).strict();

router.post("/localize", localizationRateLimit, async (req, res) => {
  const parsed = localizationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid localization request.", issues: parsed.error.flatten() });
  }
  try {
    const result = await translateUiTexts(parsed.data);
    return res.status(200).json(result);
  } catch (error) {
    req.log?.error?.({ err: error }, "AI localization failed");
    return res.status(502).json({ error: "Unable to localize the requested UI text." });
  }
});

/** ReDom AI is an interactive chat surface, so it has no rate limiter. */
router.post("/chat", authMiddleware, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) {
    return res.status(400).json({ success: false, message: "Invalid AI chat request." });
  }
  try {
    const result = await generateReDomAiReply(req.user.userId, parsed.data);
    return res.status(200).json({ success: true, reply: result.reply, model: result.model });
  } catch (error) {
    req.log?.error?.({ err: error }, "ReDom AI chat failed");
    return res.status(502).json({ success: false, message: "ReDom AI is temporarily unavailable. Please try again shortly." });
  }
});

export default router;
