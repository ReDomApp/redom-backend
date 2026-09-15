import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { authMiddleware } from "../middleware/auth.middleware";
import { db } from "../database/db";
import { activityLog } from "../database/activityLog";
import { translateUiTexts } from "../services/aiContent.service";
import { generateReDomAiReply } from "../services/reDomAiChat.service";
import { analyzeReDomAiFile, editReDomAiImage, generateReDomAiImage, transcribeReDomAiVoice } from "../services/reDomAiMedia.service";

const router = Router();

const localizationRateLimit = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const localizationSchema = z.object({ language: z.string().trim().min(2).max(32), texts: z.array(z.string().min(1).max(2_000)).min(1).max(100), context: z.string().trim().max(500).optional() });
const chatSchema = z.object({ message: z.string().trim().min(1).max(6_000), language: z.string().trim().max(64).optional(), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(6_000) })).max(20).optional(), imageDataUri: z.string().trim().max(20_000_000).optional() }).strict();
const imageSchema = z.object({ prompt: z.string().trim().min(1).max(4_000) }).strict();
const imageEditSchema = z.object({ imageDataUri: z.string().trim().min(32).max(35_000_000, "Image data is too large."), prompt: z.string().trim().min(1).max(4_000) }).strict();
const voiceSchema = z.object({ dataUri: z.string().trim().min(32).max(35_000_000) }).strict();
const fileSchema = z.object({ dataUri: z.string().trim().min(32).max(35_000_000), fileName: z.string().trim().min(1).max(160), mimeType: z.string().trim().max(160).default("application/octet-stream"), prompt: z.string().trim().max(4_000).default("Analyze this file and summarize the important information.") }).strict();
const feedbackSchema = z.object({ rating: z.enum(["good", "bad"]), reason: z.enum(["Not relevant", "Not accurate", "Too repetitive", "Harmful or offensive", "Something else"]).optional() }).strict();

router.post("/localize", localizationRateLimit, async (req, res) => {
  const parsed = localizationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid localization request.", issues: parsed.error.flatten() });
  try { const result = await translateUiTexts(parsed.data); return res.status(200).json(result); }
  catch (error) { req.log?.error?.({ err: error }, "AI localization failed"); return res.status(502).json({ error: "Unable to localize the requested UI text." }); }
});

/** ReDom AI is an interactive chat surface, so normal AI use has no rate limiter. */
router.post("/chat", authMiddleware, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid AI chat request." });
  try { const result = await generateReDomAiReply(req.user.userId, parsed.data); return res.status(200).json({ success: true, reply: result.reply, model: result.model }); }
  catch (error) { req.log?.error?.({ err: error }, "ReDom AI chat failed"); return res.status(502).json({ success: false, message: "ReDom AI is temporarily unavailable. Please try again shortly." }); }
});

router.post("/image", authMiddleware, async (req, res) => {
  const parsed = imageSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid image request." });
  try {
    const result = await generateReDomAiImage(req.user.userId, parsed.data.prompt);
    return res.status(200).json({ success: true, image: result.dataUri, model: result.model });
  } catch (error) {
    req.log?.error?.({ err: error }, "ReDom AI image generation failed");
    const message = error instanceof Error ? error.message : "OpenAI image generation failed.";
    return res.status(502).json({ success: false, message });
  }
});

router.post("/image/edit", authMiddleware, async (req, res) => {
  const parsed = imageEditSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid AI image edit request." });
  try { const result = await editReDomAiImage(req.user.userId, parsed.data.imageDataUri, parsed.data.prompt); return res.status(200).json({ success: true, image: result.dataUri, model: result.model }); }
  catch (error) { req.log?.error?.({ err: error }, "ReDom AI image edit failed"); return res.status(502).json({ success: false, message: error instanceof Error ? error.message : "OpenAI image editing failed." }); }
});

router.post("/voice/transcribe", authMiddleware, async (req, res) => {
  const parsed = voiceSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid voice prompt." });
  try { const result = await transcribeReDomAiVoice(req.user.userId, parsed.data.dataUri); return res.status(200).json({ success: true, text: result.text, model: result.model }); }
  catch (error) { req.log?.error?.({ err: error }, "ReDom AI voice transcription failed"); return res.status(502).json({ success: false, message: "ReDom AI could not understand that voice prompt." }); }
});

router.post("/file/analyze", authMiddleware, async (req, res) => {
  const parsed = fileSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid AI file request." });
  try { const result = await analyzeReDomAiFile(req.user.userId, parsed.data.dataUri, parsed.data.fileName, parsed.data.mimeType, parsed.data.prompt); return res.status(200).json({ success: true, reply: result.reply, model: result.model }); }
  catch (error) { req.log?.error?.({ err: error }, "ReDom AI file analysis failed"); return res.status(502).json({ success: false, message: "ReDom AI could not analyze that file right now." }); }
});

router.post("/feedback", authMiddleware, async (req, res) => {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId || (parsed.data.rating === "bad" && !parsed.data.reason)) return res.status(400).json({ success: false, message: "Invalid AI feedback." });
  try {
    await db.insert(activityLog).values({ userId: req.user.userId, activityType: "ai_feedback", activityCategory: "messages", activityTitle: "ReDom AI feedback", activityDescription: parsed.data.rating === "good" ? "Positive feedback was provided for a ReDom AI response." : `Negative ReDom AI feedback: ${parsed.data.reason}.`, activityIcon: parsed.data.rating === "good" ? "ai-like" : "ai-dislike", source: "app", status: "success", triggeredBy: "user", hidden: true });
    return res.status(200).json({ success: true });
  } catch (error) { req.log?.error?.({ err: error }, "ReDom AI feedback failed"); return res.status(500).json({ success: false, message: "AI feedback could not be recorded." }); }
});

export default router;
