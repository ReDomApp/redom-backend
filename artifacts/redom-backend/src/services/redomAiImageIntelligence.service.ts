import { createHash } from "node:crypto";
import { openai } from "../lib/openai";

type ImageMetadata = {
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  format: string;
  hasAlpha: boolean | null;
};

function readUInt32BE(buffer: Buffer, offset: number) {
  return buffer.readUInt32BE(offset);
}

function parseJpegSize(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isSof && length >= 7) return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3), hasAlpha: false };
    offset += length;
  }
  return null;
}

function parsePngSize(buffer: Buffer) {
  if (buffer.length < 26 || buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") return null;
  const width = readUInt32BE(buffer, 16);
  const height = readUInt32BE(buffer, 20);
  const colorType = buffer[25];
  return { width, height, hasAlpha: colorType === 4 || colorType === 6 };
}

function parseWebpSize(buffer: Buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X" && buffer.length >= 30) {
    const width = 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16);
    const height = 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16);
    return { width, height, hasAlpha: Boolean(buffer[20] & 0x10) };
  }
  return null;
}

function decodeDataUri(dataUri: string) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUri.trim());
  if (!match) throw new Error("Invalid image data.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length) throw new Error("Image is empty.");
  return { mimeType: match[1].toLowerCase(), bytes };
}

function inspectImage(dataUri: string): ImageMetadata {
  const { mimeType, bytes } = decodeDataUri(dataUri);
  const parsed = mimeType.includes("png") ? parsePngSize(bytes) : mimeType.includes("jpeg") || mimeType.includes("jpg") ? parseJpegSize(bytes) : mimeType.includes("webp") ? parseWebpSize(bytes) : null;
  const width = parsed?.width ?? null;
  const height = parsed?.height ?? null;
  return {
    mimeType,
    bytes: bytes.length,
    width,
    height,
    aspectRatio: width && height ? Number((width / height).toFixed(5)) : null,
    format: mimeType.includes("png") ? "PNG" : mimeType.includes("jpeg") || mimeType.includes("jpg") ? "JPEG" : mimeType.includes("webp") ? "WebP" : mimeType.split("/")[1]?.toUpperCase() || "IMAGE",
    hasAlpha: parsed?.hasAlpha ?? null,
  };
}

function safetyIdentifier(userId: string) {
  return createHash("sha256").update(userId).digest("hex");
}

function parseJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Image intelligence returned no structured result.");
  return JSON.parse(match[0]) as Record<string, unknown>;
}

export type ImageIntelligenceResult = {
  metadata: ImageMetadata;
  request: {
    operation: string;
    objective: string;
    targetPlatform?: string;
    targetBytes?: number;
  };
  analysis: {
    likelyBrand: string | null;
    brandConfidence: number | null;
    evidence: string[];
    detectedText: string[];
    objects: string[];
    colors: string[];
    typography: string[];
    composition: string;
    visualStyle: string[];
    intendedUses: string[];
  };
  plan: {
    operation: string;
    steps: string[];
    preserve: string[];
    change: string[];
    warnings: string[];
  };
  platform?: {
    name: string;
    dimensions?: { width: number; height: number };
    aspectRatio?: string;
    maxBytes?: number;
    formats?: string[];
    notes: string[];
  };
};

export async function analyzeReDomImageIntelligence(
  userId: string,
  dataUri: string,
  prompt: string,
  targetPlatform?: string,
  targetBytes?: number,
): Promise<ImageIntelligenceResult> {
  const metadata = inspectImage(dataUri);
  const cleanPrompt = prompt.trim().slice(0, 6_000);
  const platformHint = targetPlatform?.trim().slice(0, 100);
  const byteHint = Number.isFinite(targetBytes) && Number(targetBytes) > 0 ? Math.floor(Number(targetBytes)) : undefined;

  const instruction = [
    "You are ReDom Image Intelligence and Creative Studio.",
    "Understand the user's objective from natural language and the supplied image.",
    "Inspect the image for objects, visible text, logo/brand marks, colors, typography, composition, visual style and likely use.",
    "If the user asks what brand an image represents, use visual clues AND current web search when possible. Do not present a memory-only guess as verified.",
    "If a platform is requested, research the current official platform specifications using web search. Return dimensions, aspect ratio, file-size limits, formats, crop/safe-area notes when available. Do not invent specifications.",
    "If the user asks for a creative transformation inspired by another brand, preserve only requested general characteristics such as color direction or visual mood and plan an original result. Do not instruct the image generator to copy a protected logo, exact trademark, or distinctive brand identifier.",
    "If the user says change only a particular text, preserve everything else and identify the smallest possible edit scope.",
    "If the user asks for compression to a byte limit, classify it as compression and preserve dimensions unless reducing resolution is necessary.",
    "Return ONLY JSON with this shape:",
    JSON.stringify({
      operation: "identify_brand|creative_branding|text_replacement|platform_prepare|compress|convert_to_pdf|edit|analyze",
      objective: "short objective",
      likelyBrand: "string or null",
      brandConfidence: 0,
      evidence: ["..."],
      detectedText: ["..."],
      objects: ["..."],
      colors: ["..."],
      typography: ["..."],
      composition: "short description",
      visualStyle: ["..."],
      intendedUses: ["..."],
      steps: ["..."],
      preserve: ["..."],
      change: ["..."],
      warnings: ["..."],
      platform: { name: "platform or empty", dimensions: { width: 0, height: 0 }, aspectRatio: "0:0", maxBytes: 0, formats: ["..."], notes: ["..."] }
    }, null, 0),
    "A numeric 0 means unknown; do not fabricate unknown values.",
    "User objective: " + (cleanPrompt || "Understand this image and suggest the appropriate image workflow."),
    platformHint ? "Requested platform: " + platformHint : "No specific platform was supplied.",
    byteHint ? "Requested maximum file size in bytes: " + byteHint : "No file-size target was supplied.",
    "Image metadata known from the binary: " + JSON.stringify(metadata),
  ].join("\n");

  const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    instructions: instruction,
    input: [{ role: "user", content: [
      { type: "input_text", text: cleanPrompt || "Analyze this image and determine the appropriate workflow." },
      { type: "input_image", image_url: dataUri },
    ] }] as any,
    tools: [{ type: "web_search" } as any],
    safety_identifier: safetyIdentifier(userId),
  });

  const parsed = parseJson(response.output_text?.trim() || "");
  const platform = parsed.platform && typeof parsed.platform === "object" ? parsed.platform as Record<string, unknown> : undefined;
  const dimensions = platform?.dimensions && typeof platform.dimensions === "object" ? platform.dimensions as Record<string, unknown> : undefined;

  return {
    metadata,
    request: {
      operation: String(parsed.operation || "analyze"),
      objective: String(parsed.objective || cleanPrompt || "Analyze image"),
      ...(platformHint ? { targetPlatform: platformHint } : {}),
      ...(byteHint ? { targetBytes: byteHint } : {}),
    },
    analysis: {
      likelyBrand: typeof parsed.likelyBrand === "string" && parsed.likelyBrand.trim() ? parsed.likelyBrand.trim() : null,
      brandConfidence: typeof parsed.brandConfidence === "number" ? Math.max(0, Math.min(100, parsed.brandConfidence)) : null,
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.slice(0, 8).map(String) : [],
      detectedText: Array.isArray(parsed.detectedText) ? parsed.detectedText.slice(0, 30).map(String) : [],
      objects: Array.isArray(parsed.objects) ? parsed.objects.slice(0, 30).map(String) : [],
      colors: Array.isArray(parsed.colors) ? parsed.colors.slice(0, 20).map(String) : [],
      typography: Array.isArray(parsed.typography) ? parsed.typography.slice(0, 20).map(String) : [],
      composition: String(parsed.composition || ""),
      visualStyle: Array.isArray(parsed.visualStyle) ? parsed.visualStyle.slice(0, 20).map(String) : [],
      intendedUses: Array.isArray(parsed.intendedUses) ? parsed.intendedUses.slice(0, 20).map(String) : [],
    },
    plan: {
      operation: String(parsed.operation || "analyze"),
      steps: Array.isArray(parsed.steps) ? parsed.steps.slice(0, 20).map(String) : [],
      preserve: Array.isArray(parsed.preserve) ? parsed.preserve.slice(0, 20).map(String) : [],
      change: Array.isArray(parsed.change) ? parsed.change.slice(0, 20).map(String) : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.slice(0, 20).map(String) : [],
    },
    ...(platform && String(platform.name || "").trim() ? {
      platform: {
        name: String(platform.name),
        ...(dimensions && Number(dimensions.width) > 0 && Number(dimensions.height) > 0 ? { dimensions: { width: Number(dimensions.width), height: Number(dimensions.height) } } : {}),
        ...(typeof platform.aspectRatio === "string" && platform.aspectRatio ? { aspectRatio: platform.aspectRatio } : {}),
        ...(Number(platform.maxBytes) > 0 ? { maxBytes: Number(platform.maxBytes) } : {}),
        formats: Array.isArray(platform.formats) ? platform.formats.slice(0, 10).map(String) : [],
        notes: Array.isArray(platform.notes) ? platform.notes.slice(0, 20).map(String) : [],
      },
    } : {}),
  };
}
