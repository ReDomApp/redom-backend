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
const DEFAULT_GUIDANCE = 7.0;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_REFERENCES = 4;

const IMAGE_QUALITY_NEGATIVE_PROMPT = [
  "low quality",
  "blurry",
  "pixelated",
  "compression artifacts",
  "distorted anatomy",
  "malformed hands",
  "extra fingers",
  "duplicate limbs",
  "unwanted watermark",
].join(", ");

const PHOTOREALISM_INTENT = /\\b(photorealistic|photo[- ]realistic|photographic|realistic photo|real[- ]life photograph|hyperrealistic|hyper-realistic|realistic portrait|realistic skin|true-to-life|true to life)\\b/i;
const STYLIZED_INTENT = /\\b(anime|manga|cartoon|illustration|illustrated|watercolor|watercolour|oil painting|pencil sketch|line art|pixel art|comic book|storybook|claymation|3d render|cgi|low-poly|vector art)\\b/i;

function prepareImageQuality(prompt: string, suppliedNegativePrompt?: string) {
  const explicitPhotorealism = PHOTOREALISM_INTENT.test(prompt);
  const stylizedRequest = STYLIZED_INTENT.test(prompt);
  const applyPhotographicDetail = explicitPhotorealism || (!stylizedRequest && /\\brealistic\\b/i.test(prompt));
  const effectivePrompt = applyPhotographicDetail
    ? prompt + ", natural physically plausible lighting, believable material textures, coherent perspective, realistic fine detail, balanced exposure, natural color response"
    : prompt;
  const negativeParts = [suppliedNegativePrompt?.trim(), IMAGE_QUALITY_NEGATIVE_PROMPT].filter(Boolean);
  return {
    effectivePrompt,
    effectiveNegativePrompt: [...new Set(negativeParts)].join(", "),
    profile: applyPhotographicDetail ? "photorealistic" : "style-preserving",
    applied: applyPhotographicDetail,
  };
}

export type ReDomImageAspectRatio =
  | "1:1" | "4:3" | "3:4" | "16:9" | "9:16"
  | "3:2" | "2:3" | "4:5" | "5:4" | "21:9";

export type ReDomImageOutputFormat = "png" | "jpeg" | "webp";
export type ReDomImageOperation = "generate" | "edit" | "inpaint" | "variation";

export type ReDomImageReference = {
  dataUri: string;
  strength?: number;
  role?: "subject" | "character" | "style" | "composition" | "object";
};

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

export type GenerateOptions = {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  aspectRatio?: ReDomImageAspectRatio;
  steps?: number;
  images?: number;
  seed?: number;
  guidanceScale?: number;
  outputFormat?: ReDomImageOutputFormat;
  referenceImages?: ReDomImageReference[];
  referenceStrength?: number;
};

type EditOptions = {
  width?: number;
  height?: number;
  aspectRatio?: ReDomImageAspectRatio;
  steps?: number;
  images?: number;
  seed?: number;
  guidanceScale?: number;
  outputFormat?: ReDomImageOutputFormat;
  strength?: number;
  referenceImages?: ReDomImageReference[];
  referenceStrength?: number;
  maskDataUri?: string;
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

const RATIO_MAP: Record<ReDomImageAspectRatio, [number, number]> = {
  "1:1": [1, 1], "4:3": [4, 3], "3:4": [3, 4], "16:9": [16, 9], "9:16": [9, 16],
  "3:2": [3, 2], "2:3": [2, 3], "4:5": [4, 5], "5:4": [5, 4], "21:9": [21, 9],
};

function dimensionsForAspectRatio(aspectRatio: ReDomImageAspectRatio, base = 1024) {
  const [rw, rh] = RATIO_MAP[aspectRatio];
  if (rw >= rh) {
    const width = Math.round(base / 8) * 8;
    const height = Math.max(512, Math.round((width * rh / rw) / 8) * 8);
    return { width, height };
  }
  const height = Math.round(base / 8) * 8;
  const width = Math.max(512, Math.round((height * rw / rh) / 8) * 8);
  return { width, height };
}

function validateDimensions(width: number, height: number) {
  const maxDimension = Math.max(512, Number(process.env.REDOM_IMAGE_MAX_DIMENSION || 1536));
  if (width < 512 || width > maxDimension || height < 512 || height > maxDimension) {
    throw new Error(`ReDom-1.6RD— Image supports image dimensions from 512px through ${maxDimension}px in this release.`);
  }
  if (width % 8 !== 0 || height % 8 !== 0) throw new Error("Image dimensions must be divisible by 8.");
}

function validateDataUri(value: string, label: string, maxBytes = MAX_INPUT_BYTES) {
  const match = /^data:image\/[^;]+;base64,(.+)$/s.exec(value.trim());
  if (!match) throw new Error(`Invalid ${label}.`);
  const bytes = Buffer.from(match[1], "base64");
  if (!bytes.length || bytes.length > maxBytes) throw new Error(`${label} is too large.`);
  return value.trim();
}

function normalizeReferenceImages(referenceImages: ReDomImageReference[] | undefined) {
  const refs = referenceImages ?? [];
  if (refs.length > MAX_REFERENCES) throw new Error(`ReDom-1.6RD— Image accepts up to ${MAX_REFERENCES} reference images in this runtime.`);
  return refs.map((reference) => {
    const dataUri = validateDataUri(reference.dataUri, "reference image");
    const strength = Math.min(1, Math.max(0, reference.strength ?? 0.75));
    return { dataUri, strength, role: reference.role ?? "object" };
  });
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
  const extension = image.mimeType.includes("jpeg") || image.mimeType.includes("jpg")
    ? "jpg"
    : image.mimeType.includes("webp") ? "webp" : "png";
  const storageKey = `redom-ai/users/${userId}/generations/${jobId}/${index}.${extension}`;
  const bytes = Buffer.from(image.dataBase64, "base64");
  if (!bytes.length || bytes.length > MAX_INPUT_BYTES) throw new Error("Generated image payload is invalid.");
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

function resolveDimensions(options: { width?: number; height?: number; aspectRatio?: ReDomImageAspectRatio }) {
  if (options.aspectRatio) return dimensionsForAspectRatio(options.aspectRatio, Math.max(options.width ?? 1024, options.height ?? 1024));
  return { width: options.width ?? DEFAULT_WIDTH, height: options.height ?? DEFAULT_HEIGHT };
}

async function runImageOperation(
  userId: string,
  operation: ReDomImageOperation,
  prompt: string,
  payload: Record<string, unknown>,
  settings: Record<string, unknown>,
) {
  const quota = await reserveReDomImageQuota(userId);
  try {
    const security = await enforceReDomImageSecurity(userId, prompt, {
      hasImage: operation !== "generate" || Boolean((payload.reference_images as unknown[])?.length),
      imageDataUri: typeof payload.image_data_uri === "string" ? payload.image_data_uri : undefined,
      operation: operation === "variation" ? "edit" : operation,
    });

    const jobId = `${operation}_${randomUUID().replace(/-/g, "")}`;
    const started = Date.now();
    const response = await callEngine(operation === "generate" ? "/v1/generate" : "/v1/edit", payload);

    const stored = [];
    for (let index = 0; index < response.images.length; index += 1) {
      const image = response.images[index];
      const outputDataUri = "data:" + (image.mimeType || "image/png") + ";base64," + image.dataBase64;
      await enforceReDomImageOutputSecurity(userId, security.requestId, outputDataUri, security);
      stored.push({
        ...(await storeImage(userId, jobId, image, index)),
        width: image.width,
        height: image.height,
        mimeType: image.mimeType || "image/png",
        seed: image.seed == null ? null : String(image.seed),
      });
    }

    await db.insert(reDomAiImages).values({
      userId,
      jobId,
      operation,
      model: REDOM_IMAGE_MODEL,
      modelId: response.modelId ?? null,
      prompt,
      width: stored[0]?.width ?? Number(settings.width),
      height: stored[0]?.height ?? Number(settings.height),
      steps: Number(settings.steps),
      seed: stored[0]?.seed ?? null,
      storageKey: stored[0]?.storageKey ?? null,
      outputs: stored.map(({ storageKey, url, width, height, mimeType, seed }) => ({ storageKey, url, width, height, mimeType, seed })),
      settings,
      status: "completed",
      generationMs: response.generationMs ?? Date.now() - started,
      completedAt: new Date(),
    });

    await quota.commit();
    return {
      image: stored[0]?.url,
      images: stored,
      model: REDOM_IMAGE_MODEL,
      jobId,
      generationMs: response.generationMs ?? Date.now() - started,
      quota: await getReDomImageQuota(userId),
      settings,
    };
  } catch (error) {
    await quota.release().catch(() => undefined);
    throw error;
  }
}

export async function generateReDomImage(userId: string, options: GenerateOptions) {
  const prompt = options.prompt.trim();
  if (!prompt) throw new Error("Image prompt is required.");

  const refs = normalizeReferenceImages(options.referenceImages);
  const dimensions = resolveDimensions(options);
  const steps = options.steps ?? DEFAULT_STEPS;
  const images = options.images ?? 1;
  const guidanceScale = options.guidanceScale ?? DEFAULT_GUIDANCE;
  validateDimensions(dimensions.width, dimensions.height);
  if (steps < 1 || steps > 80 || images < 1 || images > 4) throw new Error("Invalid ReDom-1.6RD— Image generation settings.");
  if (guidanceScale < 0 || guidanceScale > 20) throw new Error("Invalid guidance scale.");

  const quality = prepareImageQuality(prompt, options.negativePrompt);
  return runImageOperation(userId, "generate", prompt, {
    prompt: quality.effectivePrompt,
    negative_prompt: quality.effectiveNegativePrompt,
    width: dimensions.width,
    height: dimensions.height,
    steps,
    images,
    seed: options.seed ?? null,
    guidance_scale: guidanceScale,
    output_format: options.outputFormat ?? "png",
    aspect_ratio: options.aspectRatio ?? null,
    reference_images: refs,
    reference_strength: options.referenceStrength ?? refs[0]?.strength ?? 0.75,
  }, {
    width: dimensions.width,
    height: dimensions.height,
    steps,
    images,
    seed: options.seed ?? null,
    guidanceScale,
    outputFormat: options.outputFormat ?? "png",
    aspectRatio: options.aspectRatio ?? null,
    referenceCount: refs.length,
    referenceStrength: options.referenceStrength ?? refs[0]?.strength ?? 0.75,
    negativePrompt: quality.effectiveNegativePrompt,
    effectivePrompt: quality.effectivePrompt,
    qualityProfile: quality.profile,
    promptEnhancementVersion: 1,
  });
}

export async function editReDomImage(userId: string, imageDataUri: string, prompt: string, options: EditOptions = {}) {
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
    validateDataUri(source, "image input");
  }

  const refs = normalizeReferenceImages(options.referenceImages);
  const dimensions = resolveDimensions(options);
  const steps = options.steps ?? DEFAULT_STEPS;
  const images = options.images ?? 1;
  const guidanceScale = options.guidanceScale ?? DEFAULT_GUIDANCE;
  const strength = options.strength ?? 0.65;
  validateDimensions(dimensions.width, dimensions.height);
  if (steps < 1 || steps > 80 || images < 1 || images > 4 || strength < 0.05 || strength > 0.95) {
    throw new Error("Invalid ReDom-1.6RD— Image edit settings.");
  }

  const maskDataUri = options.maskDataUri ? validateDataUri(options.maskDataUri, "mask image") : undefined;
  const operation: ReDomImageOperation = maskDataUri ? "inpaint" : refs.length ? "variation" : "edit";

  const quality = prepareImageQuality(trimmed);
  return runImageOperation(userId, operation, trimmed, {
    prompt: quality.effectivePrompt,
    negative_prompt: quality.effectiveNegativePrompt,
    width: dimensions.width,
    height: dimensions.height,
    steps,
    images,
    seed: options.seed ?? null,
    guidance_scale: guidanceScale,
    output_format: options.outputFormat ?? "png",
    aspect_ratio: options.aspectRatio ?? null,
    image_data_uri: sourceDataUri,
    mask_data_uri: maskDataUri ?? null,
    strength,
    reference_images: refs,
    reference_strength: options.referenceStrength ?? refs[0]?.strength ?? 0.75,
  }, {
    width: dimensions.width,
    height: dimensions.height,
    steps,
    images,
    seed: options.seed ?? null,
    guidanceScale,
    outputFormat: options.outputFormat ?? "png",
    aspectRatio: options.aspectRatio ?? null,
    strength,
    referenceCount: refs.length,
    referenceStrength: options.referenceStrength ?? refs[0]?.strength ?? 0.75,
    hasMask: Boolean(maskDataUri),
    effectivePrompt: quality.effectivePrompt,
    negativePrompt: quality.effectiveNegativePrompt,
    qualityProfile: quality.profile,
    promptEnhancementVersion: 1,
  });
}
