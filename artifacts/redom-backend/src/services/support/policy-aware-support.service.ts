import { env } from "../../config/env";
import { generateSupportReply, type SupportAccountContext, type SupportAiResult, type SupportCase, type SupportMessage } from "./support.service";
import { getPolicyDocument, renderCompletePolicy } from "./policy-assistant.service";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"] as const;

const POLICY_INTENT_SCHEMA = {
  type: "object",
  properties: {
    policy_requested: { type: "boolean", description: "True only when the user is asking for an official ReDom policy, rule, requirement, eligibility rule, restriction, privacy rule, or policy-derived explanation." },
    policy_slug: { type: ["string", "null"], description: "Canonical ReDom policy slug, or null when no policy is requested." },
    requested_sections: { type: "array", items: { type: "string" }, description: "Exact policy section headings needed to answer the user's specific policy question. Use an empty array when the whole policy is requested." },
  },
  required: ["policy_requested", "policy_slug", "requested_sections"],
};

function extractGeminiText(payload: unknown): string {
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  const steps = Array.isArray(record.steps) ? record.steps : [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i] as Record<string, unknown>;
    const content = Array.isArray(step.content) ? step.content : [];
    for (let j = content.length - 1; j >= 0; j -= 1) {
      const block = content[j] as Record<string, unknown>;
      if (typeof block.text === "string") return block.text;
    }
  }
  throw new Error("Gemini did not return policy intent text.");
}

function parseIntent(text: string): { policy_requested: boolean; policy_slug: string | null; requested_sections: string[] } {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Gemini returned invalid policy intent JSON.");
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  }
  const value = parsed as Record<string, unknown>;
  if (typeof value.policy_requested !== "boolean") throw new Error("Gemini policy intent is invalid.");
  const slug = value.policy_slug === null || value.policy_slug === undefined ? null : String(value.policy_slug);
  const sections = Array.isArray(value.requested_sections) ? value.requested_sections.filter((item): item is string => typeof item === "string") : [];
  return { policy_requested: value.policy_requested, policy_slug: slug, requested_sections: sections.slice(0, 8) };
}

async function detectPolicyIntent(message: string, subject: string | null, baseReply: string | null) {
  const policyCatalog = ["terms", "privacy", "community", "messaging", "media", "calls", "notifications", "security", "verification", "ai", "regional", "refunds", "support", "link_history"];
  const input = JSON.stringify({
    task: "Identify whether this ReDom support request asks for an official policy or a policy-derived explanation. Select only a policy from the supplied catalog. Never invent a policy or section.",
    allowed_policy_slugs: policyCatalog,
    user_subject: subject,
    user_message: message,
    draft_support_reply: baseReply,
  });

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.gemini.apiKey },
        body: JSON.stringify({
          model,
          system_instruction: "You are ReDom AI Policy Router. Classify only user-facing ReDom policy intent. Do not answer the user. Return JSON matching the supplied schema. A question about how a rule applies to a specific support issue is policy-derived intent. If uncertain, return policy_requested=false. Never select internal implementation or confidential information.",
          input,
          response_format: { type: "text", mime_type: "application/json", schema: POLICY_INTENT_SCHEMA },
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const error = new Error(`Gemini policy routing failed (${response.status}): ${body.slice(0, 400)}`) as Error & { status?: number };
        error.status = statusCode(response.status);
        throw error;
      }
      return parseIntent(extractGeminiText(await response.json()));
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 429 && status !== 500 && status !== 502 && status !== 503) break;
    }
  }
  return { policy_requested: false, policy_slug: null, requested_sections: [] as string[] };
}

function statusCode(status: number): number { return status; }

export async function generatePolicyAwareSupportReply(input: {
  message: string;
  subject?: string | null;
  account: SupportAccountContext | null;
  supportCase: SupportCase;
  history: SupportMessage[];
}): Promise<SupportAiResult> {
  const base = await generateSupportReply({ message: input.message, account: input.account, supportCase: input.supportCase, history: input.history });
  if (!base.is_safe || !base.support_reply) return base;
  const intent = await detectPolicyIntent(input.message, input.subject ?? input.supportCase.subject, base.support_reply);
  if (!intent.policy_requested || !intent.policy_slug) return base;
  const document = getPolicyDocument(intent.policy_slug);
  if (!document) return base;
  const policyText = renderCompletePolicy(document, intent.requested_sections);
  return { is_safe: true, support_reply: `${base.support_reply.trim()}\n\nOfficial ReDom policy information\n\n${policyText}` };
}
