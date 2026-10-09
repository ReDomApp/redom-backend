import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../database/db";
import { reDomAiVideos } from "../database/reDomAiVideos";
import { verificationSubscriptions } from "../database/verificationSubscriptions";
import { env } from "../config/env";
import { enforceReDomVideoPromptSecurity, enforceReDomVideoOutputSecurity } from "./redomVideoSecurity.service";
import { r2 } from "../lib/r2";

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

export async function createReDomVideoJob(
  userId: string,
  input: { prompt: string; referenceImageDataUri?: string; durationSeconds?: number; resolution?: "720p" | "1080p"; aspectRatio?: "16:9" | "9:16" | "1:1"; operation?: "generate" | "cgi"; format?: "video" | "movie" | "cartoon"; watermark?: boolean },
) {
  await requirePaidVideoEntitlement(userId);
  const security = await enforceReDomVideoPromptSecurity(userId, input.prompt);
  const target = Math.max(4, Math.min(REDOM_VIDEO_MAX_SECONDS, Math.floor(input.durationSeconds ?? 30)));
  const resolution = input.resolution ?? "720p";
  const aspectRatio = input.aspectRatio ?? "16:9";
  const operation = input.operation ?? "generate";
  const format = input.format ?? "video";
  const watermark = input.watermark !== false;
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
    runtime: REDOM_VIDEO_RUNTIME,
    model: REDOM_VIDEO_MODEL,
    operation,
    prompt: input.prompt.trim(),
    targetDurationSeconds: target,
    resolution,
    aspectRatio,
    status: "queued",
    securityRequestId: security.requestId,
  });

  if (!env.redomVideoEngine.url || !env.redomVideoEngine.token) {
    await failReDomVideoJob(jobId, "ReDom-v2.8—Video native GPU runtime is not configured.");
    throw Object.assign(new Error("ReDom-v2.8—Video is temporarily unavailable."), { status: 503 });
  }

  const response = await fetch(env.redomVideoEngine.url.replace(/\/$/, "") + "/v1/jobs", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + env.redomVideoEngine.token },
    body: JSON.stringify({
      jobId,
      runtime: REDOM_VIDEO_RUNTIME,
      model: REDOM_VIDEO_MODEL,
      operation,
      format,
      watermark,
      referenceAssetKey,
      prompt: input.prompt.trim(),
      durationSeconds: target,
      resolution,
      aspectRatio,
      callbackUrl: env.email.webBaseUrl.replace(/\/$/, "") + "/api/ai/video/callback",
      callbackToken: env.redomVideoEngine.token,
    }),
    signal: AbortSignal.timeout(env.redomVideoEngine.timeoutMs),
  });

  if (!response.ok) {
    await failReDomVideoJob(jobId, "ReDom native video worker rejected the job.");
    throw Object.assign(new Error("ReDom-v2.8—Video is temporarily unavailable."), { status: 503 });
  }

  return {
    jobId,
    model: REDOM_VIDEO_MODEL,
    runtime: REDOM_VIDEO_RUNTIME,
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
