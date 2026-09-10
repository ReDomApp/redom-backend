import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

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

router.post("/localize", aiRateLimit, async (req, res) => {
  const parsed = localizationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid localization request.",
      issues: parsed.error.flatten(),
    });
  }

  try {
    const result = await translateUiTexts(parsed.data);
    return res.status(200).json(result);
  } catch (error) {
    req.log?.error?.({ err: error }, "AI localization failed");
    return res.status(502).json({
      error: "Unable to localize the requested UI text.",
    });
  }
});

export default router;
