import { createHash, randomUUID } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "../database/db";
import { reDomAiSecurityEvents } from "../database/reDomAiSecurityEvents";
import { env } from "../config/env";
import { openai } from "../lib/openai";

export type ImageOperation =
  | "generate"
  | "edit"
  | "enhance"
  | "upscale"
  | "crop"
  | "rotate"
  | "compress"
  | "convert_to_pdf"
  | "render_pdf_to_image"
  | "ocr"
  | "text_replacement"
  | "document_field_edit"
  | "identity_document_edit"
  | "face_edit"
  | "unknown";

export type ImagePolicyCode =
  | "SAFE_TRANSFORMATION"
  | "GOVERNMENT_ID_DETECTED"
  | "GOVERNMENT_ID_FIELD_EDIT"
  | "GOVERNMENT_ID_AUTHENTICITY_MODIFICATION"
  | "FINANCIAL_DOCUMENT_DETECTED"
  | "FINANCIAL_FIELD_EDIT"
  | "FRAUD_ASSISTANCE"
  | "IMPERSONATION"
  | "FORGED_DOCUMENT"
  | "IDENTITY_PHOTO_MODIFICATION"
  | "SECURITY_FEATURE_MODIFICATION"
  | "UNSAFE_CONTENT"
  | "PROVIDER_SAFETY_BLOCK"
  | "OUTPUT_INTEGRITY_FAILURE"
  | "UNKNOWN_HIGH_RISK";

type RiskLevel = "SAFE" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
type Action = "allow" | "block";

type ProviderSignals = {
  openai?: { flagged: boolean; categories?: Record<string, boolean>; error?: string };
  gemini?: {
    blocked: boolean;
    documentClass?: string;
    governmentDocument?: boolean;
    financialDocument?: boolean;
    authenticityRelevant?: boolean;
    protectedFieldsChanged?: boolean;
    risk?: RiskLevel;
    reasons?: string[];
    rawCategories?: string[];
    error?: string;
  };
};

export type ImageSecurityDecision = {
  requestId: string;
  operation: ImageOperation;
  action: Action;
  policyCode: ImagePolicyCode;
  riskLevel: RiskLevel;
  documentClass: string;
  governmentDocument: boolean;
  financialDocument: boolean;
  authenticityRelevant: boolean;
  providerSignals: ProviderSignals;
  userMessage?: string;
};

const GOVERNMENT_TERMS = /\b(passport|driver'?s? license|driving license|national id|national identity|identity card|id card|voter(?:'s)? card|residence permit|work permit|visa|birth certificate|tax document|government id|official id|social security|ssn|mrz|pdf417|barcode|government document|official document)\b/i;
const FINANCIAL_TERMS = /\b(bank statement|bank account|routing number|account number|iban|swift|transaction|wire transfer|payment receipt|invoice|credit card|debit card|balance|salary slip|pay stub|financial statement|bank transfer)\b/i;
const FRAUD_TERMS = /\b(fake|falsif(?:y|ied|ication)|forge|forged|counterfeit|fabricat(?:e|ed)|make (?:it|this) look real|bypass|evade|undetectable|authentic(?:ate|ity)|genuine|legit(?:imate)?|verification|verify (?:this|the) document)\b/i;
const ID_FIELD_TERMS = /\b(change|replace|edit|alter|modify|rewrite|remove|add|swap|update)\b.{0,80}\b(name|surname|date of birth|dob|document number|id number|passport number|expiry|expiration|issue date|nationality|address|photo|portrait|mrz|barcode|signature|seal)\b/i;
const FINANCIAL_FIELD_TERMS = /\b(change|replace|edit|alter|modify|rewrite|remove|add|swap|update)\b.{0,80}\b(balance|amount|price|total|recipient|sender|account number|routing number|transaction|date|invoice number|payment status)\b/i;
const AUTHENTICITY_TERMS = /\b(make|make this|make it|turn this into|create)\b.{0,80}\b(real|official|authentic|genuine|valid|legit|verified)\b/i;

function userHash(userId: string) {
  return createHash("sha256").update(userId).digest("hex").slice(0, 24);
}

function classifyOperation(prompt: string, hasImage: boolean): ImageOperation {
  const p = prompt.toLowerCase();
  if (/convert|turn|save|export/.test(p) && /pdf/.test(p)) return "convert_to_pdf";
  if (/pdf/.test(p) && /image|png|jpg|jpeg|render/.test(p)) return "render_pdf_to_image";
  if (/upscale|4x|2x|8x|increase (the )?(size|resolution)|higher resolution/.test(p)) return "upscale";
  if (/enhance|sharpen|deblur|denoise|improve quality|restore/.test(p)) return "enhance";
  if (/crop|trim/.test(p)) return "crop";
  if (/rotate|straighten/.test(p)) return "rotate";
  if (/compress|reduce (the )?size/.test(p)) return "compress";
  if (/ocr|extract text|read the text/.test(p)) return "ocr";
  if (GOVERNMENT_TERMS.test(prompt) && ID_FIELD_TERMS.test(prompt)) return "identity_document_edit";
  if (FINANCIAL_TERMS.test(prompt) && FINANCIAL_FIELD_TERMS.test(prompt)) return "document_field_edit";
  if (/\b(change|replace|edit|alter|modify|remove|add|swap)\b/.test(p) && /\b(text|word|sentence|label)\b/.test(p)) return "text_replacement";
  if (/\b(face|portrait|person|identity photo|profile photo)\b/.test(p) && /\b(change|replace|edit|alter|modify|swap)\b/.test(p)) return "face_edit";
  return hasImage ? "edit" : "generate";
}

function deterministicDecision(prompt: string, operation: ImageOperation): Partial<ImageSecurityDecision> {
  const government = GOVERNMENT_TERMS.test(prompt);
  const financial = FINANCIAL_TERMS.test(prompt);
  const fraud = FRAUD_TERMS.test(prompt);
  const authenticity = AUTHENTICITY_TERMS.test(prompt);

  if (fraud && (government || financial || authenticity)) {
    return { action: "block", policyCode: "FRAUD_ASSISTANCE", riskLevel: "CRITICAL" };
  }
  if (government && (operation === "identity_document_edit" || ID_FIELD_TERMS.test(prompt))) {
    return { action: "block", policyCode: authenticity ? "GOVERNMENT_ID_AUTHENTICITY_MODIFICATION" : "GOVERNMENT_ID_FIELD_EDIT", riskLevel: "CRITICAL" };
  }
  if (financial && FINANCIAL_FIELD_TERMS.test(prompt)) {
    return { action: "block", policyCode: "FINANCIAL_FIELD_EDIT", riskLevel: "CRITICAL" };
  }
  if (authenticity && government) {
    return { action: "block", policyCode: "GOVERNMENT_ID_AUTHENTICITY_MODIFICATION", riskLevel: "CRITICAL" };
  }
  if (operation === "face_edit" && government) {
    return { action: "block", policyCode: "IDENTITY_PHOTO_MODIFICATION", riskLevel: "CRITICAL" };
  }
  return { action: "allow", policyCode: "SAFE_TRANSFORMATION", riskLevel: "LOW" };
}

async function moderatePrompt(prompt: string, imageDataUri?: string): Promise<ProviderSignals["openai"]> {
  try {
    const input = imageDataUri
      ? [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageDataUri } },
        ]
      : prompt;
    const result = await openai.moderations.create({ model: "omni-moderation-latest", input: input as any });
    const item = result.results?.[0];
    return { flagged: Boolean(item?.flagged), categories: item?.categories as unknown as Record<string, boolean> };
  } catch (error) {
    return { flagged: false, error: error instanceof Error ? error.message : "OpenAI moderation unavailable." };
  }
}

function parseJson(text: string): any {
  const fenced = text.match(/\{[\s\S]*\}/);
  if (!fenced) throw new Error("Gemini classifier returned no JSON.");
  return JSON.parse(fenced[0]);
}

async function inspectWithGemini(prompt: string, imageDataUri?: string): Promise<NonNullable<ProviderSignals["gemini"]>> {
  const key = env.gemini.apiKey;
  const model = process.env.REDOM_IMAGE_SECURITY_GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  const parts: any[] = [{
    text: [
      "You are ReDom's image-security classifier. This is a defensive classification task.",
      "Classify the user request and, if an image is attached, the image.",
      "Detect government/identity documents, financial documents, authenticity-related editing, protected identity fields, fraud assistance, and unsafe image content.",
      "Faithful transformations such as PDF conversion, rendering, compression, cropping, rotation, and enlargement are not fraud by themselves.",
      "Do not provide instructions for altering official documents. Return JSON only.",
      "Schema:",
      '{"documentClass":"ordinary|government_id|government_official|financial|unknown","governmentDocument":false,"financialDocument":false,"authenticityRelevant":false,"protectedFieldsChanged":false,"risk":"SAFE|LOW|MODERATE|HIGH|CRITICAL","blocked":false,"reasons":["..."],"rawCategories":["..."]}',
      "User request: " + prompt,
    ].join("\n"),
  }];
  if (imageDataUri) {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(imageDataUri);
    if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
  }

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_LOW_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_LOW_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_LOW_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_LOW_AND_ABOVE" },
      ],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  const body: any = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "Gemini security classification failed.");
  const blocked = Boolean(body?.promptFeedback?.blockReason) || body?.candidates?.[0]?.finishReason === "SAFETY";
  if (blocked) return { blocked: true, risk: "CRITICAL", reasons: ["Provider safety block."], rawCategories: [] };
  const text = body?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  const parsed = parseJson(text);
  return {
    blocked: Boolean(parsed.blocked),
    documentClass: typeof parsed.documentClass === "string" ? parsed.documentClass : "unknown",
    governmentDocument: Boolean(parsed.governmentDocument),
    financialDocument: Boolean(parsed.financialDocument),
    authenticityRelevant: Boolean(parsed.authenticityRelevant),
    protectedFieldsChanged: Boolean(parsed.protectedFieldsChanged),
    risk: ["SAFE","LOW","MODERATE","HIGH","CRITICAL"].includes(parsed.risk) ? parsed.risk : "MODERATE",
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 10).map(String) : [],
    rawCategories: Array.isArray(parsed.rawCategories) ? parsed.rawCategories.slice(0, 20).map(String) : [],
  };
}

async function recentCriticalBlocks(userId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const result = await db.select({ total: count() })
    .from(reDomAiSecurityEvents)
    .where(and(
      eq(reDomAiSecurityEvents.userId, userId),
      eq(reDomAiSecurityEvents.action, "block"),
      gt(reDomAiSecurityEvents.createdAt, since),
    ));
  return Number(result[0]?.total ?? 0);
}

async function record(userId: string, decision: ImageSecurityDecision, metadata?: Record<string, unknown>) {
  await db.insert(reDomAiSecurityEvents).values({
    userId,
    requestId: decision.requestId,
    operation: decision.operation,
    policyCode: decision.policyCode,
    riskLevel: decision.riskLevel,
    action: decision.action,
    documentClass: decision.documentClass,
    providerSignals: decision.providerSignals,
    metadata: { ...metadata, user: userHash(userId) },
  });
}

export async function enforceReDomImageSecurity(
  userId: string,
  prompt: string,
  options: { hasImage?: boolean; imageDataUri?: string; operation?: ImageOperation } = {},
): Promise<ImageSecurityDecision> {
  const cleanPrompt = prompt.trim();
  const requestId = "imgsec_" + randomUUID().replace(/-/g, "");
  const operation = options.operation ?? classifyOperation(cleanPrompt, Boolean(options.hasImage));
  const criticalBlocks = await recentCriticalBlocks(userId);
  if (criticalBlocks >= 5) {
    const decision: ImageSecurityDecision = {
      requestId, operation, action: "block", policyCode: "UNKNOWN_HIGH_RISK", riskLevel: "CRITICAL",
      documentClass: "unknown", governmentDocument: false, financialDocument: false, authenticityRelevant: false,
      providerSignals: {}, userMessage: "Image generation is temporarily restricted for this account after repeated blocked requests. Please try again later.",
    };
    await record(userId, decision, { phase: "abuse-prevention", windowMinutes: 60 });
    throw Object.assign(new Error(decision.userMessage), { code: decision.policyCode, status: 429 });
  }
  const deterministic = deterministicDecision(cleanPrompt, operation);
  const providerSignals: ProviderSignals = {};
  providerSignals.openai = await moderatePrompt(cleanPrompt, options.imageDataUri);

  if (providerSignals.openai.flagged) {
    const decision: ImageSecurityDecision = {
      requestId, operation, action: "block", policyCode: "UNSAFE_CONTENT", riskLevel: "HIGH",
      documentClass: "unknown", governmentDocument: false, financialDocument: false, authenticityRelevant: false,
      providerSignals, userMessage: "I can’t complete that image request. Please make another request that follows ReDom’s image safety requirements.",
    };
    await record(userId, decision);
    throw Object.assign(new Error(decision.userMessage), { code: decision.policyCode, status: 400 });
  }

  let gemini: NonNullable<ProviderSignals["gemini"]> | undefined;
  try {
    gemini = await inspectWithGemini(cleanPrompt, options.imageDataUri);
    providerSignals.gemini = gemini;
  } catch (error) {
    providerSignals.gemini = { blocked: false, risk: "MODERATE", reasons: [], rawCategories: [], error: error instanceof Error ? error.message : "Gemini unavailable." };
  }

  const governmentDocument = Boolean(gemini?.governmentDocument) || GOVERNMENT_TERMS.test(cleanPrompt);
  const financialDocument = Boolean(gemini?.financialDocument) || FINANCIAL_TERMS.test(cleanPrompt);
  const authenticityRelevant = Boolean(gemini?.authenticityRelevant) || AUTHENTICITY_TERMS.test(cleanPrompt);
  const documentClass = gemini?.documentClass || (governmentDocument ? "government_id" : financialDocument ? "financial" : "ordinary");

  let action: Action = deterministic.action ?? "allow";
  let policyCode: ImagePolicyCode = deterministic.policyCode ?? "SAFE_TRANSFORMATION";
  let riskLevel: RiskLevel = deterministic.riskLevel ?? "LOW";

  if (gemini?.blocked) {
    action = "block"; policyCode = "PROVIDER_SAFETY_BLOCK"; riskLevel = "HIGH";
  } else if (gemini?.protectedFieldsChanged && (governmentDocument || financialDocument)) {
    action = "block"; policyCode = governmentDocument ? "GOVERNMENT_ID_FIELD_EDIT" : "FINANCIAL_FIELD_EDIT"; riskLevel = "CRITICAL";
  } else if (governmentDocument && (operation === "identity_document_edit" || ID_FIELD_TERMS.test(cleanPrompt) || authenticityRelevant)) {
    action = "block"; policyCode = authenticityRelevant ? "GOVERNMENT_ID_AUTHENTICITY_MODIFICATION" : "GOVERNMENT_ID_FIELD_EDIT"; riskLevel = "CRITICAL";
  } else if (financialDocument && FINANCIAL_FIELD_TERMS.test(cleanPrompt)) {
    action = "block"; policyCode = "FINANCIAL_FIELD_EDIT"; riskLevel = "CRITICAL";
  }

  const decision: ImageSecurityDecision = {
    requestId, operation, action, policyCode, riskLevel, documentClass, governmentDocument, financialDocument,
    authenticityRelevant, providerSignals,
    userMessage: action === "block" ? "I can’t modify or create an altered official or financial document. Please make another request that doesn’t change its identity, protected information, or official/financial meaning." : undefined,
  };
  await record(userId, decision);
  if (action === "block") throw Object.assign(new Error(decision.userMessage), { code: policyCode, status: 400 });
  return decision;
}

export async function enforceReDomImageOutputSecurity(
  userId: string,
  requestId: string,
  imageDataUri: string,
  context: Pick<ImageSecurityDecision, "operation" | "governmentDocument" | "financialDocument">,
) {
  let result: NonNullable<ProviderSignals["gemini"]>;
  try {
    result = await inspectWithGemini("Inspect this generated image for official identity/financial document creation or alteration. If it appears to be an altered or fabricated official/financial document, block it.", imageDataUri);
  } catch {
    // Fail closed for output integrity when the image cannot be inspected.
    const decision: ImageSecurityDecision = {
      requestId, operation: context.operation, action: "block", policyCode: "OUTPUT_INTEGRITY_FAILURE", riskLevel: "HIGH",
      documentClass: "unknown", governmentDocument: context.governmentDocument, financialDocument: context.financialDocument,
      authenticityRelevant: true, providerSignals: {}, userMessage: "The generated image could not pass ReDom’s security checks. Please try a different request.",
    };
    await record(userId, decision, { phase: "output" });
    throw Object.assign(new Error(decision.userMessage), { code: decision.policyCode, status: 502 });
  }

  const generatedOfficialDocument = context.operation === "generate" && result.governmentDocument;
  const generatedFinancialDocument = context.operation === "generate" && result.financialDocument;
  if (result.blocked || generatedOfficialDocument || generatedFinancialDocument || (result.governmentDocument && result.authenticityRelevant) || (result.financialDocument && result.authenticityRelevant)) {
    const decision: ImageSecurityDecision = {
      requestId, operation: context.operation, action: "block", policyCode: (result.governmentDocument || result.financialDocument) ? "FORGED_DOCUMENT" : "OUTPUT_INTEGRITY_FAILURE", riskLevel: "CRITICAL",
      documentClass: result.documentClass || "unknown", governmentDocument: Boolean(result.governmentDocument), financialDocument: Boolean(result.financialDocument),
      authenticityRelevant: Boolean(result.authenticityRelevant), providerSignals: { gemini: result },
      userMessage: "The generated image did not pass ReDom’s security checks and was not saved.",
    };
    await record(userId, decision, { phase: "output" });
    throw Object.assign(new Error(decision.userMessage), { code: decision.policyCode, status: 400 });
  }

  await record(userId, {
    requestId, operation: context.operation, action: "allow", policyCode: "SAFE_TRANSFORMATION", riskLevel: result.risk || "LOW",
    documentClass: result.documentClass || "ordinary", governmentDocument: Boolean(result.governmentDocument), financialDocument: Boolean(result.financialDocument),
    authenticityRelevant: Boolean(result.authenticityRelevant), providerSignals: { gemini: result },
  }, { phase: "output" });
}
