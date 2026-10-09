import { createHash } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { and, eq, gt } from "drizzle-orm";

import { authMiddleware } from "../middleware/auth.middleware";
import { db } from "../database/db";
import { reDomAiVideos } from "../database/reDomAiVideos";
import { activityLog } from "../database/activityLog";
import { translateUiTexts } from "../services/aiContent.service";
import { generateReDomAiReply } from "../services/reDomAiChat.service";
import { getReDomImageQuota, ReDomImageQuotaError } from "../services/redomImageQuota.service";
import { analyzeReDomAiFile, editReDomAiImage, generateReDomAiImage, transcribeReDomAiVoice } from "../services/reDomAiMedia.service";
import { analyzeReDomImageIntelligence } from "../services/redomAiImageIntelligence.service";
import { completeReDomVideoJob, createReDomVideoJob, failReDomVideoJob, getReDomVideoJob } from "../services/redomVideoEngine.service";
import { env } from "../config/env";
import { approveReDomMovieTrailerAndCreateProject, createReDomMovieProject, createReDomMovieTrailerPreview, getReDomMovieProject, getReDomMovieJobContext, planReDomMovieProject, reviseReDomMovieProject, registerReDomMovieJobCallback, runReDomMovieContinuityCheck, startReDomMovieProduction } from "../services/redomVideoStudio.service";
import { listReDomMovieVoices } from "../services/redomMovieAudio.service";

import { r2 } from "../lib/r2";

const router = Router();

const localizationRateLimit = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const imageRateLimit = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many image requests. Please try again shortly." } });
const localizationSchema = z.object({ language: z.string().trim().min(2).max(32), texts: z.array(z.string().min(1).max(2_000)).min(1).max(100), context: z.string().trim().max(500).optional() });
const chatSchema = z.object({ message: z.string().trim().min(1).max(6_000), language: z.string().trim().max(64).optional(), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(6_000) })).max(20).optional(), imageDataUri: z.string().trim().max(20_000_000).optional() }).strict();
const imageReferenceSchema = z.object({
  dataUri: z.string().trim().min(32).max(35_000_000),
  strength: z.number().min(0).max(1).optional(),
  role: z.enum(["subject", "character", "style", "composition", "object"]).optional(),
}).strict();
const imageSchema = z.object({
  prompt: z.string().trim().min(1).max(4_000),
  negativePrompt: z.string().trim().max(2_000).optional(),
  width: z.number().int().min(512).max(2048).optional(),
  height: z.number().int().min(512).max(2048).optional(),
  aspectRatio: z.enum(["1:1","4:3","3:4","16:9","9:16","3:2","2:3","4:5","5:4","21:9"]).optional(),
  steps: z.number().int().min(1).max(80).optional(),
  images: z.number().int().min(1).max(4).optional(),
  seed: z.number().int().min(0).max(4_294_967_295).optional(),
  guidanceScale: z.number().min(0).max(20).optional(),
  outputFormat: z.enum(["png","jpeg","webp"]).optional(),
  referenceImages: z.array(imageReferenceSchema).max(4).optional(),
  referenceStrength: z.number().min(0).max(1).optional(),
}).strict();
const imageIntelligenceSchema = z.object({ dataUri: z.string().trim().min(32).max(35_000_000), prompt: z.string().trim().max(6_000).default("Understand this image and determine the appropriate workflow."), targetPlatform: z.string().trim().max(120).optional(), targetBytes: z.number().int().min(1).max(100_000_000).optional() }).strict();
const imageEditSchema = z.object({
  imageDataUri: z.string().trim().min(32).max(35_000_000, "Image data is too large."),
  prompt: z.string().trim().min(1).max(4_000),
  width: z.number().int().min(512).max(2048).optional(),
  height: z.number().int().min(512).max(2048).optional(),
  aspectRatio: z.enum(["1:1","4:3","3:4","16:9","9:16","3:2","2:3","4:5","5:4","21:9"]).optional(),
  steps: z.number().int().min(1).max(80).optional(),
  images: z.number().int().min(1).max(4).optional(),
  seed: z.number().int().min(0).max(4_294_967_295).optional(),
  guidanceScale: z.number().min(0).max(20).optional(),
  outputFormat: z.enum(["png","jpeg","webp"]).optional(),
  strength: z.number().min(0.05).max(0.95).optional(),
  referenceImages: z.array(imageReferenceSchema).max(4).optional(),
  referenceStrength: z.number().min(0).max(1).optional(),
  maskDataUri: z.string().trim().min(32).max(35_000_000).optional(),
}).strict();
const voiceSchema = z.object({ dataUri: z.string().trim().min(32).max(35_000_000) }).strict();
const fileSchema = z.object({ dataUri: z.string().trim().min(32).max(35_000_000), fileName: z.string().trim().min(1).max(160), mimeType: z.string().trim().max(160).default("application/octet-stream"), prompt: z.string().trim().max(4_000).default("Analyze this file and summarize the important information.") }).strict();
const feedbackSchema = z.object({ rating: z.enum(["good", "bad"]), reason: z.enum(["Not relevant", "Not accurate", "Too repetitive", "Harmful or offensive", "Something else"]).optional() }).strict();
const videoSchema = z.object({ prompt: z.string().trim().min(5).max(8_000), referenceImageDataUri: z.string().trim().min(32).max(20_000_000).optional(), operation: z.enum(["generate","cgi"]).optional(), format: z.enum(["video","movie","cartoon"]).default("video"), watermark: z.boolean().default(true), durationSeconds: z.number().int().min(4).max(300).optional(), resolution: z.enum(["720p","1080p"]).optional(), aspectRatio: z.enum(["16:9","9:16","1:1"]).optional() }).strict();
const movieProjectSchema = z.object({ prompt: z.string().trim().min(5).max(8_000), referenceImageDataUri: z.string().trim().min(32).max(20_000_000).optional(), format: z.enum(["movie","cartoon"]).default("movie"), duration: z.number().int().min(4).max(300).default(300), episodeCount: z.number().int().min(1).max(12).optional(), quality: z.enum(["fast","standard","high","pro"]).default("high"), style: z.string().trim().min(2).max(64).default("cinematic"), aspectRatio: z.enum(["16:9","9:16","1:1"]).default("16:9"), audio: z.boolean().default(true), voice: z.boolean().default(true), singingEnabled: z.boolean().default(true), soundtrackStyle: z.string().trim().min(2).max(160).optional(), singingVoiceStyle: z.string().trim().min(2).max(160).optional(), voiceAssignments: z.record(z.string(), z.string().trim().min(1).max(100)).optional(), title: z.string().trim().max(240).optional() }).strict();
const movieTrailerPreviewSchema = z.object({ prompt: z.string().trim().min(5).max(8_000), format: z.enum(["movie","cartoon"]).default("movie"), duration: z.number().int().min(15).max(25).default(20), episodeCount: z.number().int().min(1).max(12).default(6), style: z.string().trim().min(2).max(64).default("cinematic"), aspectRatio: z.enum(["16:9","9:16","1:1"]).default("16:9"), soundtrackStyle: z.string().trim().min(2).max(160).optional(), language: z.string().trim().min(2).max(64).optional() }).strict();
const movieRevisionSchema = z.object({ instruction: z.string().trim().min(3).max(8_000) }).strict();
const movieTrailerApprovalSchema = movieProjectSchema.extend({ trailerJobId: z.string().trim().min(8).max(100) });

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

router.post("/video/trailer-preview", rateLimit({ windowMs: 60_000, max: 3, standardHeaders: true, legacyHeaders: false }), authMiddleware, async (req, res) => {
  const parsed = movieTrailerPreviewSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid ReDom Movie Studio trailer preview request.", issues: parsed.success ? undefined : parsed.error.flatten() });
  try {
    const result = await createReDomMovieTrailerPreview(req.user.userId, {
      prompt: parsed.data.prompt, format: parsed.data.format, durationSeconds: parsed.data.duration,
      episodeCount: parsed.data.episodeCount, style: parsed.data.style, aspectRatio: parsed.data.aspectRatio,
      soundtrackStyle: parsed.data.soundtrackStyle, language: parsed.data.language,
    });
    return res.status(202).json({ success: true, ...result });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 502;
    return res.status(status >= 400 && status < 600 ? status : 502).json({
      success: false, code: (error as { code?: string })?.code,
      message: error instanceof Error ? error.message : "Trailer preview could not be created.",
    });
  }
});

router.post("/video/trailer-preview/approve", rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false }), authMiddleware, async (req, res) => {
  const parsed = movieTrailerApprovalSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid ReDom Movie Studio trailer approval request.", issues: parsed.success ? undefined : parsed.error.flatten() });
  try {
    const { trailerJobId, ...projectInput } = parsed.data;
    const result = await approveReDomMovieTrailerAndCreateProject(req.user.userId, trailerJobId, {
      prompt: projectInput.prompt, referenceImageDataUri: projectInput.referenceImageDataUri, durationSeconds: projectInput.duration,
      episodeCount: projectInput.episodeCount, quality: projectInput.quality, style: projectInput.style, format: projectInput.format,
      aspectRatio: projectInput.aspectRatio, audio: projectInput.audio, voice: projectInput.voice,
      singingEnabled: projectInput.singingEnabled, soundtrackStyle: projectInput.soundtrackStyle, singingVoiceStyle: projectInput.singingVoiceStyle, voiceAssignments: projectInput.voiceAssignments, title: projectInput.title,
    });
    return res.status(202).json({ success: true, ...result });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 502;
    return res.status(status >= 400 && status < 600 ? status : 502).json({
      success: false, code: (error as { code?: string })?.code,
      message: error instanceof Error ? error.message : "Approved trailer could not be converted into a project.",
    });
  }
});

router.post("/video/projects", rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false }), authMiddleware, async (req, res) => {
  const parsed = movieProjectSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid ReDom Movie Studio request." });
  try {
    const result = await createReDomMovieProject(req.user.userId, { prompt: parsed.data.prompt, referenceImageDataUri: parsed.data.referenceImageDataUri, durationSeconds: parsed.data.duration, episodeCount: parsed.data.episodeCount, quality: parsed.data.quality, style: parsed.data.style, format: parsed.data.format, aspectRatio: parsed.data.aspectRatio, audio: parsed.data.audio, voice: parsed.data.voice, singingEnabled: parsed.data.singingEnabled, soundtrackStyle: parsed.data.soundtrackStyle, singingVoiceStyle: parsed.data.singingVoiceStyle, voiceAssignments: parsed.data.voiceAssignments, title: parsed.data.title });
    return res.status(202).json({ success: true, ...result });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 502;
    return res.status(status >= 400 && status < 600 ? status : 502).json({ success: false, code: (error as { code?: string })?.code, message: error instanceof Error ? error.message : "Movie project could not be created." });
  }
});

router.post("/video/projects/:projectId/plan", authMiddleware, async (req, res) => {
  if (!req.user?.userId) return res.status(401).json({ success: false, message: "Authentication required." });
  try { return res.status(200).json({ success: true, ...(await planReDomMovieProject(req.user.userId, String(req.params.projectId))) }); }
  catch (error) { const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 502; return res.status(status >= 400 && status < 600 ? status : 502).json({ success: false, message: error instanceof Error ? error.message : "Movie planning failed." }); }
});

router.post("/video/projects/:projectId/revise", authMiddleware, async (req, res) => {
  const parsed = movieRevisionSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid ReDom Movie Studio revision." });
  try { return res.status(200).json({ success: true, ...(await reviseReDomMovieProject(req.user.userId, String(req.params.projectId), parsed.data.instruction)) }); }
  catch (error) { const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 502; return res.status(status >= 400 && status < 600 ? status : 502).json({ success: false, code: (error as { code?: string })?.code, message: error instanceof Error ? error.message : "Movie revision failed." }); }
});

router.get("/video/projects/:projectId", authMiddleware, async (req, res) => {
  if (!req.user?.userId) return res.status(401).json({ success: false, message: "Authentication required." });
  try { return res.status(200).json({ success: true, ...(await getReDomMovieProject(req.user.userId, String(req.params.projectId))) }); }
  catch (error) { const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 404; return res.status(status).json({ success: false, message: error instanceof Error ? error.message : "Movie project not found." }); }
});

router.post("/video/projects/:projectId/continuity/check", authMiddleware, async (req, res) => {
  if (!req.user?.userId) return res.status(401).json({ success: false, message: "Authentication required." });
  try { return res.status(200).json({ success: true, ...(await runReDomMovieContinuityCheck(req.user.userId, String(req.params.projectId))) }); }
  catch (error) { const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 502; return res.status(status >= 400 && status < 600 ? status : 502).json({ success: false, message: error instanceof Error ? error.message : "Continuity check failed." }); }
});

router.post("/video/projects/:projectId/produce", rateLimit({ windowMs: 60_000, max: 2, standardHeaders: true, legacyHeaders: false }), authMiddleware, async (req, res) => {
  if (!req.user?.userId) return res.status(401).json({ success: false, message: "Authentication required." });
  try { return res.status(202).json({ success: true, ...(await startReDomMovieProduction(req.user.userId, String(req.params.projectId))) }); }
  catch (error) { const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 502; return res.status(status >= 400 && status < 600 ? status : 502).json({ success: false, message: error instanceof Error ? error.message : "Movie production could not start." }); }
});

router.post("/video", rateLimit({ windowMs: 60_000, max: 3, standardHeaders: true, legacyHeaders: false }), authMiddleware, async (req, res) => {
  const parsed = videoSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid ReDom-v2.8—Video request." });
  try {
    const result = await createReDomVideoJob(req.user.userId, parsed.data);
    return res.status(202).json({ success: true, ...result });
  } catch (error) {
    req.log?.error?.({ err: error }, "ReDom-v2.8—Video job creation failed");
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 502;
    return res.status(status >= 400 && status < 600 ? status : 502).json({ success: false, code: (error as { code?: string })?.code, message: error instanceof Error ? error.message : "Video generation is temporarily unavailable." });
  }
});

router.get("/video/voices", authMiddleware, async (req, res) => {
  if (!req.user?.userId) return res.status(401).json({ success: false, message: "Authentication required." });
  try {
    const result = await listReDomMovieVoices();
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 502;
    return res.status(status >= 400 && status < 600 ? status : 502).json({
      success: false, code: (error as { code?: string })?.code,
      message: error instanceof Error ? error.message : "ReDom Voices could not load voice profiles.",
    });
  }
});

router.get("/video/:jobId", authMiddleware, async (req, res) => {
  if (!req.user?.userId) return res.status(401).json({ success: false, message: "Authentication required." });
  try { return res.status(200).json({ success: true, ...(await getReDomVideoJob(req.user.userId, String(req.params.jobId))) }); }
  catch (error) { const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 404; return res.status(status).json({ success: false, message: error instanceof Error ? error.message : "Video job not found." }); }
});

router.post("/video/callback", async (req, res) => {
  if (req.headers.authorization !== "Bearer " + env.redomVideoEngine.token) return res.status(401).json({ success: false });
  const jobId = typeof req.body?.jobId === "string" ? req.body.jobId : "";
  if (!jobId) return res.status(400).json({ success: false });
  try {
    const movieContext = await getReDomMovieJobContext(jobId);
    if (movieContext) {
      if (req.body.status === "processing") {
        await registerReDomMovieJobCallback(jobId, "processing");
      } else if (req.body.status === "completed" && typeof req.body.storageKey === "string") {
        if (movieContext.kind === "final_composition") {
          const object = await r2.send(new GetObjectCommand({ Bucket: env.cloudflare.r2.bucketName, Key: req.body.storageKey }));
          if (!object.Body) throw new Error("Final movie output is empty.");
          const bytes = Buffer.from(await object.Body.transformToByteArray());
          const { enforceReDomVideoOutputSecurity } = await import("../services/redomVideoSecurity.service");
          await enforceReDomVideoOutputSecurity(movieContext.userId, "movie_output_" + jobId, bytes);
        }
        await registerReDomMovieJobCallback(jobId, "completed", req.body.storageKey, undefined);
      } else if (req.body.status === "failed" || req.body.status === "blocked") {
        await registerReDomMovieJobCallback(jobId, req.body.status, undefined, String(req.body.error ?? "Video generation failed."));
      } else return res.status(400).json({ success: false, message: "Invalid callback state." });
      return res.status(200).json({ success: true });
    }
    if (req.body.status === "completed" && typeof req.body.storageKey === "string") await completeReDomVideoJob(jobId, req.body.storageKey, Number(req.body.durationSeconds ?? 0));
    else if (req.body.status === "failed") await failReDomVideoJob(jobId, String(req.body.error ?? "Video generation failed."));
    else return res.status(400).json({ success: false, message: "Invalid callback state." });
    return res.status(200).json({ success: true });
  } catch (error) {
    req.log?.error?.({ err: error }, "ReDom-v2.8—Video callback failed");
    if (req.body.status === "completed") {
      const movieContext = await getReDomMovieJobContext(jobId).catch(() => null);
      if (movieContext) await registerReDomMovieJobCallback(jobId, "failed", undefined, "Video output failed ReDom security validation.").catch(() => undefined);
      else await failReDomVideoJob(jobId, "Video output failed ReDom security validation.").catch(() => undefined);
    }
    return res.status(502).json({ success: false });
  }
});

router.get("/video/:jobId/download", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) return res.status(401).send("Missing download token.");
  const hash = createHash("sha256").update(token).digest("hex");
  const rows = await db.select().from(reDomAiVideos).where(and(eq(reDomAiVideos.jobId, String(req.params.jobId)), eq(reDomAiVideos.downloadTokenHash, hash), gt(reDomAiVideos.downloadTokenExpiresAt, new Date()))).limit(1);
  const row = rows[0];
  if (!row?.storageKey) return res.status(404).send("Video is unavailable.");
  try {
    const object = await r2.send(new GetObjectCommand({ Bucket: env.cloudflare.r2.bucketName, Key: row.storageKey }));
    res.status(200);
    res.setHeader("Content-Type", "video/mp4");
    if (object.ContentLength) res.setHeader("Content-Length", String(object.ContentLength));
    res.setHeader("Cache-Control", "private, max-age=900");
    if (object.Body) return res.end(Buffer.from(await object.Body.transformToByteArray()));
    return res.end();
  } catch { return res.status(404).send("Video is unavailable."); }
});

router.get("/image/quota", authMiddleware, async (req, res) => {
  if (!req.user?.userId) return res.status(401).json({ success: false, message: "Authentication required." });
  try { return res.status(200).json({ success: true, quota: await getReDomImageQuota(req.user.userId) }); } catch (error) { req.log?.error?.({ err: error }, "ReDom AI image quota lookup failed"); return res.status(500).json({ success: false, message: "Image quota could not be loaded." }); }
});


router.post("/image/intelligence", imageRateLimit, authMiddleware, async (req, res) => {
  const parsed = imageIntelligenceSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid image intelligence request." });
  try {
    const result = await analyzeReDomImageIntelligence(req.user.userId, parsed.data.dataUri, parsed.data.prompt, parsed.data.targetPlatform, parsed.data.targetBytes);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    req.log?.error?.({ err: error }, "ReDom AI image intelligence failed");
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 502;
    return res.status(status >= 400 && status < 600 ? status : 502).json({ success: false, message: error instanceof Error ? error.message : "ReDom AI image intelligence is temporarily unavailable." });
  }
});

router.post("/image", imageRateLimit, authMiddleware, async (req, res) => {
  const parsed = imageSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid image request." });
  try {
    const result = await generateReDomAiImage(req.user.userId, parsed.data.prompt, {
      negativePrompt: parsed.data.negativePrompt,
      width: parsed.data.width,
      height: parsed.data.height,
      aspectRatio: parsed.data.aspectRatio,
      steps: parsed.data.steps,
      images: parsed.data.images,
      seed: parsed.data.seed,
      guidanceScale: parsed.data.guidanceScale,
      outputFormat: parsed.data.outputFormat,
      referenceImages: parsed.data.referenceImages,
      referenceStrength: parsed.data.referenceStrength,
    });
    return res.status(200).json({ success: true, image: result.dataUri, images: result.images, model: result.model, jobId: result.jobId, generationMs: result.generationMs, settings: result.settings, quota: result.quota });
  } catch (error) {
    req.log?.error?.({ err: error }, "ReDom AI image generation failed");
    if (error instanceof ReDomImageQuotaError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message, quota: error.quota, upgrade: { available: Boolean(error.upgradeProduct), product: error.upgradeProduct } });
    }
    const message = error instanceof Error ? error.message : "ReDom-1.6RD— Image generation failed.";
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 502;
    return res.status(status >= 400 && status < 600 ? status : 502).json({ success: false, message });
  }
});

router.post("/image/edit", imageRateLimit, authMiddleware, async (req, res) => {
  const parsed = imageEditSchema.safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid AI image edit request." });
  try {
    const result = await editReDomAiImage(req.user.userId, parsed.data.imageDataUri, parsed.data.prompt, {
      width: parsed.data.width,
      height: parsed.data.height,
      aspectRatio: parsed.data.aspectRatio,
      steps: parsed.data.steps,
      images: parsed.data.images,
      seed: parsed.data.seed,
      guidanceScale: parsed.data.guidanceScale,
      outputFormat: parsed.data.outputFormat,
      strength: parsed.data.strength,
      referenceImages: parsed.data.referenceImages,
      referenceStrength: parsed.data.referenceStrength,
      maskDataUri: parsed.data.maskDataUri,
    });
    return res.status(200).json({ success: true, image: result.dataUri, images: result.images, model: result.model, jobId: result.jobId, generationMs: result.generationMs, settings: result.settings });
  } catch (error) {
    req.log?.error?.({ err: error }, "ReDom AI image edit failed");
    if (error instanceof ReDomImageQuotaError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message, quota: error.quota, upgrade: { available: Boolean(error.upgradeProduct), product: error.upgradeProduct } });
    }
    const message = error instanceof Error ? error.message : "ReDom-1.6RD— Image editing failed.";
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 502;
    return res.status(status >= 400 && status < 600 ? status : 502).json({ success: false, message });
  }
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
