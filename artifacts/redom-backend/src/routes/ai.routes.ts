import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { authMiddleware } from "../middleware/auth.middleware";
import { generateReDomAiReply } from "../services/aiChat.service";
import { translateUiTexts } from "../services/aiContent.service";

const router = Router();

const aiRateLimit = rateLimit({
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
  message: z.string().trim().min(1).max(12_000),
  previousResponseId: z.string().trim().max(200).optional(),
  sharedChatContext: z.string().trim().max(8_000).optional(),
});

router.post("/localize", aiRateLimit, async (req, res) => {
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

router.post("/chat", authMiddleware, aiRateLimit, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid ReDom AI request.", issues: parsed.error.flatten() });
  }
  try {
    const result = await generateReDomAiReply(parsed.data);
    return res.status(200).json({ success: true, assistant: "ReDom AI", ...result });
  } catch (error) {
    req.log?.error?.({ err: error, userId: req.user?.userId }, "ReDom AI chat failed");
    return res.status(502).json({ success: false, message: "ReDom AI is temporarily unavailable. Please try again." });
  }
});

export default router;
