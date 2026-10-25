import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { generateInternalAiReply, getInternalAiStatus, InternalAiError } from "../services/internal-ai/internal-ai.service";

const router = Router();
const limit = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const schema = z.object({
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().trim().min(1).max(12_000),
  }).strict()).min(1).max(40),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(4096).optional(),
  conversationId: z.string().trim().min(1).max(128).optional(),
}).strict().superRefine((value, context) => {
  if (value.messages.reduce((n, message) => n + message.content.length, 0) > 48_000) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Request is too large." });
  }
  if (!value.messages.some((message) => message.role === "user")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "A user message is required." });
  }
});

router.get("/status", authMiddleware, (_req, res) => {
  const engine = getInternalAiStatus();
  return res.status(engine.enabled ? 200 : 503).json({ success: engine.enabled, engine });
});

router.get("/models", authMiddleware, (_req, res) => {
  const engine = getInternalAiStatus();
  return res.json({
    success: true,
    engine: engine.id,
    enabled: engine.enabled,
    models: engine.model ? [{ id: engine.model, provider: "self-hosted" }] : [],
  });
});

router.post("/chat/completions", authMiddleware, limit, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, code: "INVALID_REQUEST", message: "Invalid internal AI request." });
  }
  try {
    const result = await generateInternalAiReply(parsed.data);
    return res.json({ success: true, engine: "redom-internal-ai", ...result });
  } catch (error) {
    if (error instanceof InternalAiError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    }
    req.log?.error?.({ err: error }, "ReDom Internal AI request failed");
    return res.status(502).json({ success: false, code: "INTERNAL_AI_UNAVAILABLE", message: "ReDom Internal AI is temporarily unavailable." });
  }
});

export default router;
