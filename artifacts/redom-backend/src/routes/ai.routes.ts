import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { authMiddleware } from "../middleware/auth.middleware";
import { translateUiTexts } from "../services/aiContent.service";
import { generateReDomAiReply } from "../services/reDomAiChat.service";
import { generateReDomAiImage, transcribeReDomAiVoice } from "../services/reDomAiMedia.service";

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
  imageDataUri: z.string().trim().max(20_000_000).optional(),
}).strict();

const imageSchema = z.object({
  prompt: z.string().trim().min(1).max(4_000),
}).strict();

const voiceSchema = z.object({
  dataUri: z.string().trim().min(32).max(35_000_000),
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

/** ReDom AI is an interactive chat surface, so normal AI use has no rate limiter. */
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

/** AI image creation is user-initiated and has no ReDom messaging rate limiter. */
router.post("/image", authMiddleware, async (req, res) => {
  const parsed = imageSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) {
    return res.status(400).json({ success: false, message: "Invalid image request." });
  }
  try {
    const result = await generateReDomAiImage(req.user.userId, parsed.data.prompt);
    return res.status(200).json({ success: true, image: result.dataUri, model: result.model });
  } catch (error) {
    req.log?.error?.({ err: error }, "ReDom AI image generation failed");
    return res.status(502).json({ success: false, message: "ReDom AI could not create the image right now." });
  }
});

/** Voice prompts are transcribed server-side; the OpenAI credential never enters the mobile app. */
router.post("/voice/transcribe", authMiddleware, async (req, res) => {
  const parsed = voiceSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) {
    return res.status(400).json({ success: false, message: "Invalid voice prompt." });
  }
  try {
    const result = await transcribeReDomAiVoice(req.user.userId, parsed.data.dataUri);
    return res.status(200).json({ success: true, text: result.text, model: result.model });
  } catch (error) {
    req.log?.error?.({ err: error }, "ReDom AI voice transcription failed");
    return res.status(502).json({ success: false, message: "ReDom AI could not understand that voice prompt." });
  }
});

export default router;
