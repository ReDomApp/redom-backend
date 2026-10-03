import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull, or, gt } from "drizzle-orm";
import { db } from "../database/db";
import { reDomAiVideos } from "../database/reDomAiVideos";
import { verificationSubscriptions } from "../database/verificationSubscriptions";
import { env } from "../config/env";
import { enforceReDomVideoPromptSecurity, enforceReDomVideoOutputSecurity } from "./redomVideoSecurity.service";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "../lib/r2";

const PAID_PLANS = new Set(["standard", "standard_plus", "plus", "creator", "business", "corporate"]);
export const REDOM_VIDEO_MODEL = "ReDom-v2.8—Video";
export const REDOM_VIDEO_MAX_SECONDS = 300;

async function requirePaidVideoEntitlement(userId: string) {
  const now = new Date();
  const rows = await db.select({ subscriptionType: verificationSubscriptions.subscriptionType })
    .from(verificationSubscriptions)
    .where(and(eq(verificationSubscriptions.userId, userId), eq(verificationSubscriptions.subscriptionStatus, "active"), or(isNull(verificationSubscriptions.expiresAt), gt(verificationSubscriptions.expiresAt, now))));
  if (!rows.some((row) => PAID_PLANS.has(row.subscriptionType))) {
    throw Object.assign(new Error("ReDom-v2.8—Video is a paid ReDom AI feature. An active paid ReDom AI plan is required."), { code: "VIDEO_PAID_FEATURE_REQUIRED", status: 402 });
  }
}

export async function createReDomVideoJob(userId: string, input: { prompt: string; provider?: "seedance" | "veo" | "gemini"; durationSeconds?: number; resolution?: "720p" | "1080p"; aspectRatio?: "16:9" | "9:16" | "1:1" }) {
  await requirePaidVideoEntitlement(userId);
  const security = await enforceReDomVideoPromptSecurity(userId, input.prompt);
  const target = Math.max(4, Math.min(REDOM_VIDEO_MAX_SECONDS, Math.floor(input.durationSeconds ?? 30)));
  const provider = input.provider ?? "seedance";
  const model = provider === "seedance" ? "seedance-2.5" : provider === "veo" ? "veo-3.1" : "gemini-omni-1.1-flash";
  const jobId = "vid_" + randomUUID().replace(/-/g, "");
  await db.insert(reDomAiVideos).values({
    userId, jobId, provider, model, prompt: input.prompt.trim(), targetDurationSeconds: target,
    resolution: input.resolution ?? "720p", aspectRatio: input.aspectRatio ?? "16:9", status: "queued", securityRequestId: security.requestId,
  });
  const workerUrl = env.redomVideoEngine.url;
  if (!workerUrl || !env.redomVideoEngine.token) throw Object.assign(new Error("ReDom-v2.8—Video engine is not configured."), { status: 503 });
  const response = await fetch(workerUrl.replace(/\/$/, "") + "/v1/jobs", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + env.redomVideoEngine.token },
    body: JSON.stringify({ jobId, prompt: input.prompt.trim(), provider, durationSeconds: target, resolution: input.resolution ?? "720p", aspectRatio: input.aspectRatio ?? "16:9", callbackUrl: env.email.webBaseUrl.replace(/\/$/, "") + "/api/ai/video/callback", callbackToken: env.redomVideoEngine.token }),
    signal: AbortSignal.timeout(env.redomVideoEngine.timeoutMs),
  });
  if (!response.ok) {
    await db.update(reDomAiVideos).set({ status: "failed", error: "Video worker rejected the job." }).where(eq(reDomAiVideos.jobId, jobId));
    throw Object.assign(new Error("ReDom-v2.8—Video is temporarily unavailable."), { status: 503 });
  }
  return { jobId, model, status: "queued", maxDurationSeconds: REDOM_VIDEO_MAX_SECONDS };
}

export async function getReDomVideoJob(userId: string, jobId: string) {
  const rows = await db.select().from(reDomAiVideos).where(and(eq(reDomAiVideos.userId, userId), eq(reDomAiVideos.jobId, jobId))).limit(1);
  if (!rows[0]) throw Object.assign(new Error("Video job not found."), { status: 404 });
  const row = rows[0];
  let downloadUrl: string | null = null;
  if (row.status === "completed" && row.storageKey) {
    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
    await db.update(reDomAiVideos).set({ downloadTokenHash: hash, downloadTokenExpiresAt: new Date(Date.now() + 15 * 60_000) }).where(eq(reDomAiVideos.id, row.id));
    downloadUrl = "/api/ai/video/" + encodeURIComponent(jobId) + "/download?token=" + token;
  }
  return { jobId: row.jobId, status: row.status, provider: row.provider, model: row.model, durationSeconds: row.targetDurationSeconds, downloadUrl, error: row.error };
}

export async function completeReDomVideoJob(jobId: string, storageKey: string, durationSeconds: number) {
  const row = (await db.select().from(reDomAiVideos).where(eq(reDomAiVideos.jobId, jobId)).limit(1))[0];
  if (!row) throw new Error("Video job not found.");
  const object = await r2.send(new GetObjectCommand({ Bucket: env.cloudflare.r2.bucketName, Key: storageKey }));
  const bytes = Buffer.from(await object.Body!.transformToByteArray());
  try {
    await enforceReDomVideoOutputSecurity(row.userId, row.securityRequestId || "vidsec_callback_" + jobId, bytes);
  } catch (error) {
    await db.update(reDomAiVideos).set({ status: "blocked", error: "Output security validation failed.", completedAt: new Date() }).where(eq(reDomAiVideos.jobId, jobId));
    throw error;
  }
  await db.update(reDomAiVideos).set({ status: "completed", storageKey, generationMs: Date.now() - row.createdAt.getTime(), completedAt: new Date() }).where(eq(reDomAiVideos.jobId, jobId));
  return { success: true, durationSeconds };
}

export async function failReDomVideoJob(jobId: string, error: string) {
  await db.update(reDomAiVideos).set({ status: "failed", error: error.slice(0, 1000), completedAt: new Date() }).where(eq(reDomAiVideos.jobId, jobId));
}
