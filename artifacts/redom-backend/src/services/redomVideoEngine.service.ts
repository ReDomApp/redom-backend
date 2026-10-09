import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../database/db";
import { reDomAiVideos } from "../database/reDomAiVideos";
import { verificationSubscriptions } from "../database/verificationSubscriptions";
import { env } from "../config/env";
import { enforceReDomVideoPromptSecurity, enforceReDomVideoOutputSecurity } from "./redomVideoSecurity.service";
import { r2 } from "../lib/r2";
import { openai } from "../lib/openai";

const PAID_PLANS = new Set(["standard", "standard_plus", "plus", "creator", "business", "corporate"]);
export const REDOM_VIDEO_MODEL = "ReDom-v2.8—Video";
export const REDOM_VIDEO_RUNTIME = "redom-v2.8-native";
export const REDOM_VIDEO_MAX_SECONDS = 300;

async function requirePaidVideoEntitlement(userId: string) {
  const now = new Date();
  const rows = await db.select({ subscriptionType: verificationSubscriptions.subscriptionType })
    .from(verificationSubscriptions)
    .where(and(
      eq(verificationSubscriptions.userId, userId),
      eq(verificationSubscriptions.subscriptionStatus, "active"),
      or(isNull(verificationSubscriptions.expiresAt), gt(verificationSubscriptions.expiresAt, now)),
    ));
  if (!rows.some((row) => PAID_PLANS.has(row.subscriptionType))) {
    throw Object.assign(new Error("ReDom-v2.8—Video is a paid ReDom AI feature. An active paid ReDom AI plan is required."), { code: "VIDEO_PAID_FEATURE_REQUIRED", status: 402 });
  }
}


export async function prepareReDomVideoLanguage(prompt: string, format: "video" | "movie" | "cartoon") {
  const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    instructions: [
      "You are ReDom's multilingual video language and social-caption director.",
      "Detect the language actually used by the creator in the prompt. Do not default to English.",
      "Return JSON only: {\"languageName\": string, \"languageCode\": string, \"caption\": string, \"generationDirection\": string}.",
      "caption must be a concise, engaging post caption for the resulting video, written in the detected prompt language, not a translation of these instructions. Avoid hashtags unless natural for the language.",
      "generationDirection must instruct the video model to preserve the detected language for any visible text, dialogue direction and story details; do not fabricate audio or claim speech was generated if it was not.",
      "Do not translate proper names unless the language convention requires it."
    ].join("\n"),
    input: "Format: " + format + "\nCreator prompt:\n" + prompt,
    safety_identifier: "redom-video-language",
  });
  let parsed: { languageName?: string; languageCode?: string; caption?: string; generationDirection?: string };
  try { parsed = JSON.parse(response.output_text || "{}"); } catch { throw Object.assign(new Error("ReDom could not reliably determine the prompt language."), { code: "VIDEO_LANGUAGE_DETECTION_FAILED", status: 502 }); }
  if (!parsed.languageName || !parsed.languageCode || !parsed.caption || !parsed.generationDirection) {
    throw Object.assign(new Error("ReDom could not prepare a localized video caption."), { code: "VIDEO_CAPTION_GENERATION_FAILED", status: 502 });
  }
  return {
    languageName: parsed.languageName.slice(0, 80),
    languageCode: parsed.languageCode.slice(0, 16),
    caption: parsed.caption.slice(0, 500),
    generationDirection: parsed.generationDirection.slice(0, 1000),
  };
}


export async function createReDomVideoJob(
  userId: string,
  input: { prompt: string; referenceImageDataUri?: string; languageName?: string; languageCode?: string; caption?: string; generationDirection?: string; durationSeconds?: number; resolution?: "720p" | "1080p"; aspectRatio?: "16:9" | "9:16" | "1:1"; operation?: "generate" | "cgi"; format?: "video" | "movie" | "cartoon"; watermark?: boolean; audioEnabled?: boolean; audioTracks?: Array<Record<string, unknown>>; musicTracks?: Array<Record<string, unknown>>; lipSyncEnabled?: boolean },
) {
  await requirePaidVideoEntitlement(userId);
  const security = await enforceReDomVideoPromptSecurity(userId, input.prompt);
  const format = input.format ?? "video";
  const language = await prepareReDomVideoLanguage(input.prompt, format);
  const target = Math.max(4, Math.min(REDOM_VIDEO_MAX_SECONDS, Math.floor(input.durationSeconds ?? 30)));
  const resolution = input.resolution ?? "720p";
  const aspectRatio = input.aspectRatio ?? "16:9";
  const operation = input.operation ?? "generate";
  const watermark = input.watermark !== false;
  // Route by product format. A model outage fails closed; it never falls back
  // to another product's model or credentials.
  const modelConfig = format === "cartoon"
    ? { model: "Cartoon—R8.0", runtime: "redom-cartoon-r8-native", endpoint: env.redomCartoonEngine }
    : format === "movie"
      ? { model: "Studio—Ultron 8.0R", runtime: "redom-studio-ultron-8r-native", endpoint: env.redomStudioEngine }
      : { model: REDOM_VIDEO_MODEL, runtime: REDOM_VIDEO_RUNTIME, endpoint: env.redomVideoEngine };
  const jobId = "vid_" + randomUUID().replace(/-/g, "");
  let referenceAssetKey: string | undefined;
  if (input.referenceImageDataUri) {
    const match = input.referenceImageDataUri.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw Object.assign(new Error("Reference image must be a PNG, JPEG, or WebP data URI."), { code: "INVALID_VIDEO_REFERENCE_IMAGE", status: 400 });
    const contentType = "image/" + match[1];
    const imageBytes = Buffer.from(match[2], "base64");
    if (imageBytes.length < 32 || imageBytes.length > 15 * 1024 * 1024) throw Object.assign(new Error("Reference image is outside the supported size range."), { code: "INVALID_VIDEO_REFERENCE_IMAGE", status: 400 });
    referenceAssetKey = `redom-ai/video-references/${userId}/${jobId}/reference.${match[1] === "jpeg" ? "jpg" : match[1]}`;
    await r2.send(new PutObjectCommand({ Bucket: env.cloudflare.r2.bucketName, Key: referenceAssetKey, Body: imageBytes, ContentType: contentType, CacheControl: "private, max-age=900" }));
  }

  await db.insert(reDomAiVideos).values({
    userId,
    jobId,
    runtime: modelConfig.runtime,
    model: modelConfig.model,
    operation,
    prompt: input.prompt.trim(),
    targetDurationSeconds: target,
    resolution,
    aspectRatio,
    status: "queued",
    securityRequestId: security.requestId,
  });

  if (!modelConfig.endpoint.url || !modelConfig.endpoint.token) {
    if (referenceAssetKey) await r2.send(new DeleteObjectCommand({ Bucket: env.cloudflare.r2.bucketName, Key: referenceAssetKey }));
    await failReDomVideoJob(jobId, "ReDom-v2.8—Video native GPU runtime is not configured.");
    throw Object.assign(new Error("ReDom-v2.8—Video is temporarily unavailable."), { status: 503 });
  }

  const response = await fetch(modelConfig.endpoint.url.replace(/\/$/, "") + "/v1/jobs", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + modelConfig.endpoint.token },
    body: JSON.stringify({
      jobId,
      runtime: modelConfig.runtime,
      model: modelConfig.model,
      operation,
      format,
      watermark,
      audioEnabled: input.audioEnabled === true,
      audioTracks: input.audioTracks || [],
      musicTracks: input.musicTracks || [],
      lipSyncEnabled: input.lipSyncEnabled === true,
      languageName: language.languageName,
      languageCode: language.languageCode,
      captionText: language.caption,
      generationDirection: language.generationDirection,
      referenceAssetKey,
      prompt: input.prompt.trim(),
      durationSeconds: target,
      resolution,
      quality: resolution === "1080p" ? "pro" : "high",
      aspectRatio,
      callbackUrl: env.redomBackendUrl.replace(/\/$/, "") + "/ai/video/callback",
      callbackToken: modelConfig.endpoint.token,
    }),
    signal: AbortSignal.timeout(modelConfig.endpoint.timeoutMs),
  });

  if (!response.ok) {
    if (referenceAssetKey) await r2.send(new DeleteObjectCommand({ Bucket: env.cloudflare.r2.bucketName, Key: referenceAssetKey }));
    await failReDomVideoJob(jobId, "ReDom native video worker rejected the job.");
    throw Object.assign(new Error("ReDom-v2.8—Video is temporarily unavailable."), { status: 503 });
  }

  return {
    jobId,
    model: modelConfig.model,
    runtime: modelConfig.runtime,
    status: "queued",
    maxDurationSeconds: REDOM_VIDEO_MAX_SECONDS,
  };
}

export async function getReDomVideoJob(userId: string, jobId: string) {
  const rows = await db.select().from(reDomAiVideos).where(and(eq(reDomAiVideos.userId, userId), eq(reDomAiVideos.jobId, jobId))).limit(1);
  if (!rows[0]) throw Object.assign(new Error("Video job not found."), { status: 404 });
  const row = rows[0];
  let downloadUrl: string | null = null;
  if (row.status === "completed" && row.storageKey) {
    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
    await db.update(reDomAiVideos).set({
      downloadTokenHash: hash,
      downloadTokenExpiresAt: new Date(Date.now() + 15 * 60_000),
    }).where(eq(reDomAiVideos.id, row.id));
    downloadUrl = "/api/ai/video/" + encodeURIComponent(jobId) + "/download?token=" + token;
  }
  return {
    jobId: row.jobId,
    status: row.status,
    model: row.model,
    runtime: row.runtime,
    operation: row.operation,
    durationSeconds: row.targetDurationSeconds,
    downloadUrl,
    error: row.error,
  };
}

export async function completeReDomVideoJob(jobId: string, storageKey: string, durationSeconds: number) {
  const row = (await db.select().from(reDomAiVideos).where(eq(reDomAiVideos.jobId, jobId)).limit(1))[0];
  if (!row) throw new Error("Video job not found.");

  const object = await r2.send(new GetObjectCommand({ Bucket: env.cloudflare.r2.bucketName, Key: storageKey }));
  const bytes = Buffer.from(await object.Body!.transformToByteArray());

  try {
    await enforceReDomVideoOutputSecurity(row.userId, row.securityRequestId || "vidsec_callback_" + jobId, bytes);
  } catch (error) {
    await db.update(reDomAiVideos).set({
      status: "blocked",
      error: "Output security validation failed.",
      completedAt: new Date(),
    }).where(eq(reDomAiVideos.jobId, jobId));
    throw error;
  }

  if (durationSeconds < 1 || durationSeconds > REDOM_VIDEO_MAX_SECONDS) {
    await db.update(reDomAiVideos).set({
      status: "blocked",
      error: "Output duration failed ReDom validation.",
      completedAt: new Date(),
    }).where(eq(reDomAiVideos.jobId, jobId));
    throw new Error("Video output duration failed validation.");
  }

  await db.update(reDomAiVideos).set({
    status: "completed",
    storageKey,
    generationMs: Date.now() - row.createdAt.getTime(),
    completedAt: new Date(),
  }).where(eq(reDomAiVideos.jobId, jobId));

  return { success: true, durationSeconds };
}

export async function failReDomVideoJob(jobId: string, error: string) {
  await db.update(reDomAiVideos).set({
    status: "failed",
    error: error.slice(0, 1000),
    completedAt: new Date(),
  }).where(eq(reDomAiVideos.jobId, jobId));
}
