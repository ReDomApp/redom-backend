import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../database/db";
import { reDomAiImages } from "../database/reDomAiImages";
import { env } from "../config/env";
import { r2 } from "../lib/r2";
import { enforceReDomImageOutputSecurity, enforceReDomImageSecurity } from "./redomImageSecurity.service";
import { getReDomImageQuota, reserveReDomImageQuota } from "./redomImageQuota.service";

export const REDOM_IMAGE_MODEL = "ReDom-1.6RD— Image";
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;
const DEFAULT_STEPS = 30;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

type EngineImage = {
  mimeType: string;
  dataBase64: string;
  width: number;
  height: number;
  seed?: number | string | null;
};

type EngineResponse = {
  model: string;
  modelId?: string;
  generationMs?: number;
  images: EngineImage[];
};

type GenerateOptions = {
  prompt: string;
  width?: number;
  height?: number;
  steps?: number;
  images?: number;
  seed?: number;
};

function engineConfig() {
  const url = process.env.REDOM_IMAGE_ENGINE_URL?.trim();
  if (!url) throw new Error("ReDom-1.6RD— Image GPU engine is not configured.");
  return {
    url: url.replace(/\/$/, ""),
    token: process.env.REDOM_IMAGE_ENGINE_TOKEN?.trim() || "",
    timeoutMs: Math.max(5_000, Number(process.env.REDOM_IMAGE_ENGINE_TIMEOUT_MS || 180_000)),
  };
}

function validateDimensions(width: number, height: number) {
  if (width < 512 || width > 1536 || height < 512 || height > 1536) {
    throw new Error("ReDom-1.6RD— Image supports image dimensions from 512px through 1536px in this release.");
  }
  if (width % 8 !== 0 || height % 8 !== 0) throw new Error("Image dimensions must be divisible by 8.");
}

async function callEngine(path: string, payload: Record<string, unknown>): Promise<EngineResponse> {
  const config = engineConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(config.url + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.token ? { "x-redom-engine-token": config.token } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const raw = await response.text();
    let body: any = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (!response.ok) {
      throw new Error(typeof body?.detail === "string" ? body.detail : "ReDom-1.6RD— Image GPU generation failed.");
    }
    if (!Array.isArray(body?.images) || !body.images.length) throw new Error("ReDom-1.6RD— Image returned no image data.");
    return body as EngineResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("ReDom-1.6RD— Image generation timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function storeImage(userId: string, jobId: string, image: EngineImage, index: number) {
  const extension = image.mimeType.includes("jpeg") || image.mimeType.includes("jpg") ? "jpg" : "png";
  const storageKey = "redom-ai/users/" + userId + "/generations/" + jobId + "/" + index + "." + extension;
  const bytes = Buffer.from(image.dataBase64, "base64");
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error("Generated image payload is invalid.");
  await r2.send(new PutObjectCommand({
    Bucket: env.cloudflare.r2.bucketName,
    Key: storageKey,
    Body: bytes,
    ContentType: image.mimeType || "image/png",
    CacheControl: "private, max-age=31536000, immutable",
  }));
  const base = env.cloudflare.r2.bucketEndpoint.replace(/\/$/, "");
  return { storageKey, url: base + "/" + storageKey };
}

export async function generateReDomImage(userId: string, options: GenerateOptions) {
  const prompt = options.prompt.trim();
  if (!prompt) throw new Error("Image prompt is required.");
  const quota = await reserveReDomImageQuota(userId);
  try {
    const security = await enforceReDomImageSecurity(userId, prompt, { hasImage: false, operation: "generate" });
    const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const steps = options.steps ?? DEFAULT_STEPS;
  const images = options.images ?? 1;
  validateDimensions(width, height);
  if (steps < 1 || steps > 60 || images < 1 || images > 4) throw new Error("Invalid ReDom-1.6RD— Image generation settings.");

  const jobId = "gen_" + randomUUID().replace(/-/g, "");
  const started = Date.now();
  const response = await callEngine("/v1/generate", { prompt, width, height, steps, images, seed: options.seed ?? null });
  const first = response.images[0];
  const outputDataUri = "data:" + (first.mimeType || "image/png") + ";base64," + first.dataBase64;
  await enforceReDomImageOutputSecurity(userId, security.requestId, outputDataUri, security);
  const stored = await storeImage(userId, jobId, first, 0);

  await db.insert(reDomAiImages).values({
    userId,
    jobId,
    operation: "generate",
    model: REDOM_IMAGE_MODEL,
    modelId: response.modelId ?? null,
    prompt,
    width: first.width || width,
    height: first.height || height,
    steps,
    seed: first.seed == null ? null : String(first.seed),
    storageKey: stored.storageKey,
    status: "completed",
    generationMs: response.generationMs ?? Date.now() - started,
    completedAt: new Date(),
  });

  return { image: stored.url, model: REDOM_IMAGE_MODEL, jobId, generationMs: response.generationMs ?? Date.now() - started };
}

export async function editReDomImage(userId: string, imageDataUri: string, prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Image edit prompt is required.");
  const source = imageDataUri.trim();
  let sourceDataUri = source;
  if (/^https:\/\//i.test(source)) {
    const allowedBase = env.cloudflare.r2.bucketEndpoint.replace(/\/$/, "");
    if (!source.startsWith(allowedBase + "/")) throw new Error("Only images stored by ReDom can be edited from a stored image URL.");
    const response = await fetch(source);
    if (!response.ok) throw new Error("The selected ReDom image could not be loaded.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_INPUT_BYTES) throw new Error("Image is too large.");
    const mimeType = response.headers.get("content-type")?.split(";")[0] || "image/png";
    if (!mimeType.startsWith("image/")) throw new Error("The selected resource is not an image.");
    sourceDataUri = "data:" + mimeType + ";base64," + bytes.toString("base64");
  } else {
    const match = /^data:image\/[^;]+;base64,(.+)$/s.exec(source);
    if (!match) throw new Error("Invalid image input.");
    const bytes = Buffer.from(match[1], "base64");
    if (!bytes.length || bytes.length > MAX_INPUT_BYTES) throw new Error("Image is too large.");
  }

  const security = await enforceReDomImageSecurity(userId, trimmed, {
    hasImage: true,
    imageDataUri: sourceDataUri,
    operation: "edit",
  });

  const jobId = "edit_" + randomUUID().replace(/-/g, "");
  const started = Date.now();
  const response = await callEngine("/v1/edit", {
    prompt: trimmed,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    steps: DEFAULT_STEPS,
    images: 1,
    image_data_uri: sourceDataUri,
    strength: 0.65,
  });
  const first = response.images[0];
  const outputDataUri = "data:" + (first.mimeType || "image/png") + ";base64," + first.dataBase64;
  await enforceReDomImageOutputSecurity(userId, security.requestId, outputDataUri, security);
  const stored = await storeImage(userId, jobId, first, 0);

  await db.insert(reDomAiImages).values({
    userId,
    jobId,
    operation: "edit",
    model: REDOM_IMAGE_MODEL,
    modelId: response.modelId ?? null,
    prompt: trimmed,
    width: first.width || DEFAULT_WIDTH,
    height: first.height || DEFAULT_HEIGHT,
    steps: DEFAULT_STEPS,
    seed: first.seed == null ? null : String(first.seed),
    storageKey: stored.storageKey,
    status: "completed",
    generationMs: response.generationMs ?? Date.now() - started,
    completedAt: new Date(),
  });

  return { image: stored.url, model: REDOM_IMAGE_MODEL, jobId, generationMs: response.generationMs ?? Date.now() - started };
}
