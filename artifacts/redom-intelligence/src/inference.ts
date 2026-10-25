export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatRequest = { model?: string; messages: ChatMessage[]; temperature?: number; max_tokens?: number };
export type InferenceConfig = { baseUrl: string; apiKey: string; model: string; timeoutMs: number };
export class InferenceError extends Error {
  public readonly statusCode: number; public readonly errorCode: string;
  constructor(message: string, statusCode: number, errorCode: string) { super(message); this.name = "InferenceError"; this.statusCode = statusCode; this.errorCode = errorCode; }
}
export function readInferenceConfig(env: NodeJS.ProcessEnv = process.env): InferenceConfig | null {
  const baseUrl = env.INFERENCE_BASE_URL?.trim().replace(/\/+$/, ""), apiKey = env.INFERENCE_API_KEY?.trim(), model = env.INFERENCE_MODEL?.trim();
  const timeout = Number(env.INFERENCE_TIMEOUT_MS ?? "90000");
  if (!baseUrl || !apiKey || !model) return null;
  try { const url = new URL(baseUrl); if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.search || url.hash || (url.pathname !== "" && url.pathname !== "/")) return null; }
  catch { return null; }
  return { baseUrl, apiKey, model, timeoutMs: Number.isFinite(timeout) ? Math.min(Math.max(timeout, 1_000), 180_000) : 90_000 };
}
export async function completeChat(request: ChatRequest, config: InferenceConfig, publicModelId = config.model): Promise<Record<string, unknown>> {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const upstream = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages: request.messages, ...(request.temperature === undefined ? {} : { temperature: request.temperature }), ...(request.max_tokens === undefined ? {} : { max_tokens: request.max_tokens }), stream: false }), signal: controller.signal,
    });
    if (!upstream.ok) { if (upstream.status === 429) throw new InferenceError("Model capacity reached; retry later.", 429, "MODEL_CAPACITY"); throw new InferenceError("The configured model server returned an error.", 502, "MODEL_UPSTREAM_ERROR"); }
    const payload: unknown = await upstream.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new InferenceError("The model server returned an invalid response.", 502, "INVALID_MODEL_RESPONSE");
    const record = payload as Record<string, unknown>, choices = record.choices;
    if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") throw new InferenceError("The model server returned no completion.", 502, "INVALID_MODEL_RESPONSE");
    const message = (choices[0] as Record<string, unknown>).message;
    if (!message || typeof message !== "object" || typeof (message as Record<string, unknown>).content !== "string") throw new InferenceError("The model server returned no text completion.", 502, "INVALID_MODEL_RESPONSE");
    return { ...record, model: publicModelId };
  } catch (error) {
    if (error instanceof InferenceError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new InferenceError("Model inference timed out.", 504, "MODEL_TIMEOUT");
    throw new InferenceError("The configured model server is unreachable.", 502, "MODEL_UNAVAILABLE");
  } finally { clearTimeout(timeout); }
}
export async function isInferenceReady(config: InferenceConfig, timeoutMs = 3_000): Promise<boolean> {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/v1/models`, { method: "GET", headers: { authorization: `Bearer ${config.apiKey}` }, signal: controller.signal });
    if (!response.ok) return false;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    const data = (payload as Record<string, unknown>).data;
    return Array.isArray(data) && data.some((item) => Boolean(item) && typeof item === "object" && (item as Record<string, unknown>).id === config.model);
  } catch { return false; } finally { clearTimeout(timeout); }
}
