import type { ChatMessage, ChatRequest } from "./inference.js";

export function validateChatRequest(value: unknown, configuredModel: string): ChatRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.model !== undefined && body.model !== configuredModel) return null;
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 100) return null;
  const messages: ChatMessage[] = [];
  let totalChars = 0;
  for (const item of body.messages) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const message = item as Record<string, unknown>;
    if (!["system", "user", "assistant"].includes(String(message.role)) ||
        typeof message.content !== "string" || message.content.length > 200_000) return null;
    totalChars += message.content.length;
    if (totalChars > 500_000) return null;
    messages.push({ role: message.role as ChatMessage["role"], content: message.content });
  }
  const temperature = body.temperature;
  if (temperature !== undefined &&
      (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2)) return null;
  const maxTokens = body.max_tokens;
  if (maxTokens !== undefined &&
      (typeof maxTokens !== "number" || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 32_768)) return null;
  if (body.web_search !== undefined && typeof body.web_search !== "boolean") return null;
  return {
    model: configuredModel,
    messages,
    ...(temperature === undefined ? {} : { temperature: temperature as number }),
    ...(maxTokens === undefined ? {} : { max_tokens: maxTokens as number }),
    ...(body.web_search === undefined ? {} : { web_search: body.web_search as boolean }),
  };
}
