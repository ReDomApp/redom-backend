import { createHash, randomUUID } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "../database/db";
import { reDomAiSecurityEvents } from "../database/reDomAiSecurityEvents";
import { env } from "../config/env";
import { openai } from "../lib/openai";

export type ReDomMediaSecurityDecision = {
  requestId: string;
  action: "allow" | "block";
  policyCode: "SAFE_TRANSFORMATION" | "UNSAFE_CONTENT" | "IDENTITY_PHOTO_MODIFICATION" | "DECEPTIVE_MEDIA" | "FRAUD_ASSISTANCE" | "REFERENCE_RIGHTS_REQUIRED" | "REFERENCE_CONSENT_REQUIRED" | "CHARACTER_RIGHTS_REQUIRED" | "UNKNOWN_HIGH_RISK";
  riskLevel: "SAFE" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  userMessage?: string;
};

const IDENTITY = /\b(face|likeness|identity|portrait|person)\b.{0,100}\b(swap|replace|change|edit|alter|clone|impersonat|deepfake)\b/i;
const DECEPTIVE = /\b(deepfake|deep fake|impersonat|clone (?:a|the) (?:person|voice|face)|make (?:someone|a person) say|false evidence|fabricated evidence|mislead|deceive|pretend to be)\b/i;
const FRAUD = /\b(fake|forged|forge|counterfeit|fabricat|falsif|make (?:it|this) look real|undetectable|bypass verification|evade detection|stolen identity)\b/i;
const GOVERNMENT = /\b(passport|driver'?s? license|national id|identity card|id card|voter(?:'s)? card|residence permit|visa|birth certificate|government id|mrz|official document|barcode)\b/i;
const FINANCIAL = /\b(bank statement|routing number|account number|iban|swift|invoice|credit card|debit card|balance|salary slip|pay stub|financial statement|transaction receipt)\b/i;
const SEXUAL = /\b(porn|pornographic|explicit sex|sexual intercourse|nude|nudity|naked|sexually explicit|erotic sexual|genital|sexualized)\b/i;
const UNSAFE = /\b(graphic sexual violence|child sexual|exploit(?:ing|ative) minors|terrorist propaganda|instructions? to (?:make|build) a weapon)\b/i;

function userHash(userId: string) { return createHash("sha256").update(userId).digest("hex").slice(0, 24); }

async function record(userId: string, decision: ReDomMediaSecurityDecision, phase: "input" | "output" | "abuse-prevention") {
  await db.insert(reDomAiSecurityEvents).values({
    userId,
    requestId: decision.requestId,
    operation: "video_generate",
    policyCode: decision.policyCode,
    riskLevel: decision.riskLevel,
    action: decision.action,
    documentClass: "video",
    providerSignals: {},
    metadata: { phase, user: userHash(userId) },
  });
}

async function recentBlocks(userId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const rows = await db.select({ total: count() }).from(reDomAiSecurityEvents).where(
    and(eq(reDomAiSecurityEvents.userId, userId), eq(reDomAiSecurityEvents.action, "block"), gt(reDomAiSecurityEvents.createdAt, since)),
  );
  return Number(rows[0]?.total ?? 0);
}

async function moderatePrompt(prompt: string) {
  const result = await openai.moderations.create({ model: "omni-moderation-latest", input: prompt });
  return { flagged: Boolean(result.results?.[0]?.flagged) };
}

async function classifyWithGemini(prompt: string) {
  const model = process.env.REDOM_IMAGE_SECURITY_GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.gemini.apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text:
        "You are ReDom's defensive media safety classifier. Return JSON only. " +
        "Classify whether this video request asks for identity manipulation, deceptive/deepfake media, fraud or forged evidence, explicit sexual content, dangerous unsafe content, unconsented real-person likeness use, or unauthorized reproduction of a protected fictional character. " +
        "Original fictional characters, original cartoons, authorized references, ordinary filmmaking, and harmless CGI are allowed. A watermark does not make unauthorized likeness use safe. For real-person references require explicit informed consent and adult status; for protected studio characters require a documented license or verified public-domain basis. Never infer consent or rights from an upload alone. " +
        '{"identityManipulation":false,"deceptiveMedia":false,"fraud":false,"sexualContent":false,"unsafeContent":false,"unconsentedLikeness":false,"protectedCharacterCopy":false,"blocked":false}\nRequest: ' + prompt,
      }] }],
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_LOW_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_LOW_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_LOW_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_LOW_AND_ABOVE" },
      ],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!response.ok) return {};
  const body: any = await response.json();
  if (body?.promptFeedback?.blockReason || body?.candidates?.[0]?.finishReason === "SAFETY") return { blocked: true };
  const text = body?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : {};
}

export async function enforceReDomVideoPromptSecurity(userId: string, prompt: string): Promise<ReDomMediaSecurityDecision> {
  const clean = prompt.trim();
  const requestId = "vidsec_" + randomUUID().replace(/-/g, "");

  if (await recentBlocks(userId) >= 5) {
    const decision: ReDomMediaSecurityDecision = {
      requestId, action: "block", policyCode: "UNKNOWN_HIGH_RISK", riskLevel: "CRITICAL",
      userMessage: "Video generation is temporarily restricted after repeated blocked requests. Please try again later.",
    };
    await record(userId, decision, "abuse-prevention");
    throw Object.assign(new Error(decision.userMessage), { code: decision.policyCode, status: 429 });
  }

  let moderation: { flagged: boolean };
  let classification: Record<string, any>;
  try {
    moderation = await moderatePrompt(clean);
    classification = await classifyWithGemini(clean);
  } catch {
    const decision: ReDomMediaSecurityDecision = { requestId, action: "block", policyCode: "UNKNOWN_HIGH_RISK", riskLevel: "HIGH", userMessage: "ReDom could not complete the required safety checks. The request was not sent to generation; please retry shortly." };
    await record(userId, decision, "input");
    throw Object.assign(new Error(decision.userMessage), { code: decision.policyCode, status: 503 });
  }
  const identity = IDENTITY.test(clean) || Boolean(classification.identityManipulation);
  const deceptive = DECEPTIVE.test(clean) || Boolean(classification.deceptiveMedia);
  const fraud = FRAUD.test(clean) || GOVERNMENT.test(clean) || FINANCIAL.test(clean) || Boolean(classification.fraud);
  const sexual = SEXUAL.test(clean) || Boolean(classification.sexualContent);
  const unsafe = UNSAFE.test(clean) || Boolean(classification.unsafeContent) || Boolean(classification.blocked);
  const unconsentedLikeness = Boolean(classification.unconsentedLikeness);
  const protectedCharacterCopy = Boolean(classification.protectedCharacterCopy);

  let policyCode: ReDomMediaSecurityDecision["policyCode"] = "SAFE_TRANSFORMATION";
  let riskLevel: ReDomMediaSecurityDecision["riskLevel"] = "LOW";
  let blocked = false;

  if (moderation.flagged || sexual) { blocked = true; policyCode = sexual ? "UNSAFE_CONTENT" : "UNSAFE_CONTENT"; riskLevel = "HIGH"; }
  else if (identity) { blocked = true; policyCode = "IDENTITY_PHOTO_MODIFICATION"; riskLevel = "CRITICAL"; }
  else if (deceptive) { blocked = true; policyCode = "DECEPTIVE_MEDIA"; riskLevel = "CRITICAL"; }
  else if (fraud) { blocked = true; policyCode = "FRAUD_ASSISTANCE"; riskLevel = "CRITICAL"; }
  else if (unconsentedLikeness) { blocked = true; policyCode = "REFERENCE_CONSENT_REQUIRED"; riskLevel = "CRITICAL"; }
  else if (protectedCharacterCopy) { blocked = true; policyCode = "CHARACTER_RIGHTS_REQUIRED"; riskLevel = "HIGH"; }
  else if (unsafe) { blocked = true; policyCode = "UNSAFE_CONTENT"; riskLevel = "HIGH"; }

  const decision: ReDomMediaSecurityDecision = {
    requestId, action: blocked ? "block" : "allow", policyCode, riskLevel,
    userMessage: blocked ? "I can’t create that video. Please choose a safe creative request that does not manipulate identity, create deceptive evidence, assist fraud, or contain unsafe content." : undefined,
  };
  await record(userId, decision, "input");
  if (blocked) throw Object.assign(new Error(decision.userMessage), { code: decision.policyCode, status: 400 });
  return decision;
}

export async function enforceReDomVideoOutputSecurity(userId: string, requestId: string, videoBytes: Buffer) {
  if (videoBytes.length < 1024) {
    const decision: ReDomMediaSecurityDecision = { requestId, action: "block", policyCode: "UNKNOWN_HIGH_RISK", riskLevel: "HIGH", userMessage: "The generated video did not pass ReDom’s output validation and was not saved." };
    await record(userId, decision, "output");
    throw Object.assign(new Error(decision.userMessage), { code: decision.policyCode, status: 502 });
  }

  const model = process.env.REDOM_IMAGE_SECURITY_GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  const start = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": env.gemini.apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(videoBytes.length),
      "X-Goog-Upload-Header-Content-Type": "video/mp4",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "redom-video-" + requestId + ".mp4" } }),
  });
  if (!start.ok) throw new Error("Video output security inspection could not start.");
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Video output security inspection did not return an upload target.");

  const uploaded = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Length": String(videoBytes.length), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: videoBytes,
  });
  if (!uploaded.ok) throw new Error("Video output security inspection upload failed.");
  const metadata: any = await uploaded.json();
  const fileName = metadata?.file?.name;
  const fileUri = metadata?.file?.uri;
  if (!fileName || !fileUri) throw new Error("Video output security metadata is incomplete.");

  let state = "PROCESSING";
  for (let i = 0; i < 90 && state === "PROCESSING"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/" + fileName, { headers: { "x-goog-api-key": env.gemini.apiKey } });
    const body: any = await response.json();
    state = body?.state || body?.file?.state || "FAILED";
    if (state === "FAILED") throw new Error("Video output security inspection failed.");
  }

  const inspection = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.gemini.apiKey },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        { type: "video", uri: fileUri, mime_type: "video/mp4", processing: "static" },
        { type: "text", text: "Inspect the entire generated video. Return JSON only with booleans: identityManipulation, deceptiveMedia, fraud, sexualContent, unsafeContent, blocked. Ordinary fictional filmmaking and harmless CGI are allowed." },
      ],
    }),
  });
  if (!inspection.ok) throw new Error("Video output security inspection failed.");
  const body: any = await inspection.json();
  const text = body?.output_text || body?.outputs?.find((item: any) => item?.type === "text")?.text || "";
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Video output security returned no validation result.");
  const result = JSON.parse(match[0]);
  const blocked = Boolean(result.blocked || result.identityManipulation || result.deceptiveMedia || result.fraud || result.sexualContent || result.unsafeContent);

  const decision: ReDomMediaSecurityDecision = {
    requestId,
    action: blocked ? "block" : "allow",
    policyCode: blocked ? (result.identityManipulation ? "IDENTITY_PHOTO_MODIFICATION" : result.deceptiveMedia ? "DECEPTIVE_MEDIA" : result.fraud ? "FRAUD_ASSISTANCE" : "UNSAFE_CONTENT") : "SAFE_TRANSFORMATION",
    riskLevel: blocked ? "CRITICAL" : "LOW",
    userMessage: blocked ? "The generated video did not pass ReDom’s security validation and was not made available." : undefined,
  };
  await record(userId, decision, "output");
  if (blocked) throw Object.assign(new Error(decision.userMessage), { code: decision.policyCode, status: 400 });
}
