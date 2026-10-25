import { randomUUID } from "node:crypto";

export type InternalAiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type InternalAiRequest = {
  messages: InternalAiMessage[];
  temperature?: number;
  maxTokens?: number;
  conversationId?: string;
};

export type InternalAiResult = {
  id: string;
  model: string;
  reply: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  latencyMs: number;
};

export class InternalAiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 502,
    public readonly code: string = "INTERNAL_AI_UPSTREAM_ERROR",
  ) {
    super(message);
    this.name = "InternalAiError";
  }
}

function configuration() {
  const baseUrl = process.env.INTERNAL_AI_BASE_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.INTERNAL_AI_API_KEY?.trim();
  const model = process.env.INTERNAL_AI_MODEL?.trim();
  const timeoutValue = Number(process.env.INTERNAL_AI_TIMEOUT_MS ?? "90000");
  const timeoutMs = Number.isFinite(timeoutValue)
    ? Math.min(Math.max(timeoutValue, 1_000), 180_000)
    : 90_000;

  return {
    baseUrl,
    apiKey,
    model,
    timeoutMs,
    configured: Boolean(baseUrl && apiKey && model),
  };
}

/** Reports configuration readiness only; it never probes or leaks the GPU endpoint. */
export function getInternalAiStatus() {
  const config = configuration();
  return {
    id: "redom-internal-ai",
    name: "ReDom Internal AI",
    architecture: "independent-openai-compatible-inference",
    configured: config.configured,
    model: config.configured ? config.model : null,
    provider: "self-hosted",
    enabled: process.env.INTERNAL_AI_ENABLED === "true" && config.configured,
  };
}

/**
 * Calls only the dedicated internal inference endpoint. No third-party fallback,
 * existing AI service, database, or user-provided URL is consulted.
 */
export async function generateInternalAiReply(
  input: InternalAiRequest,
): Promise<InternalAiResult> {
  const config = configuration();

  if (process.env.INTERNAL_AI_ENABLED !== "true" || !config.configured) {
    throw new InternalAiError(
      "ReDom Internal AI is not configured yet. The existing AI providers are not used as a fallback.",
      503,
      "INTERNAL_AI_NOT_CONFIGURED",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 1_024,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Never return upstream response bodies: inference servers may echo details.
      const status = response.status === 429 ? 429 : 502;
      throw new InternalAiError(
        status === 429
          ? "The internal AI engine is at capacity. Please retry shortly."
          : "The internal AI engine could not complete this request.",
        status,
        status === 429 ? "INTERNAL_AI_CAPACITY" : "INTERNAL_AI_UPSTREAM_ERROR",
      );
    }

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") {
      throw new InternalAiError("The internal AI engine returned an invalid response.");
    }

    const data = payload as {
      id?: unknown;
      model?: unknown;
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new InternalAiError("The internal AI engine returned no text.");
    }

    const promptTokens = data.usage?.prompt_tokens;
    const completionTokens = data.usage?.completion_tokens;
    const totalTokens = data.usage?.total_tokens;

    return {
      id: typeof data.id === "string" ? data.id : randomUUID(),
      model: typeof data.model === "string" ? data.model : config.model!,
      reply: content.trim(),
      usage: {
        ...(typeof promptTokens === "number" ? { promptTokens } : {}),
        ...(typeof completionTokens === "number" ? { completionTokens } : {}),
        ...(typeof totalTokens === "number" ? { totalTokens } : {}),
      },
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error instanceof InternalAiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new InternalAiError("The internal AI engine timed out.", 504, "INTERNAL_AI_TIMEOUT");
    }
    throw new InternalAiError("The internal AI engine is unreachable.", 502, "INTERNAL_AI_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}
