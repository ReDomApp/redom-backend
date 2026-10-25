export type WebSource = { title: string; url: string; description: string; age?: string };

const SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const QUERY_MAX = 400;
const RESULT_COUNT = 5;
const TIMEOUT_MS = 8_000;

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) return null;
    return url.toString();
  } catch { return null; }
}

/** Search is mediated by a fixed provider endpoint. The model cannot request arbitrary URLs. */
export async function searchWeb(query: string, apiKey = process.env.BRAVE_SEARCH_API_KEY): Promise<WebSource[]> {
  const normalized = query.trim().replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, QUERY_MAX);
  if (!normalized) throw Object.assign(new Error("A non-empty web search query is required."), { statusCode: 400, errorCode: "INVALID_TOOL_ARGUMENT" });
  if (!apiKey?.trim()) throw Object.assign(new Error("Web search is not configured on this deployment."), { statusCode: 503, errorCode: "WEB_SEARCH_NOT_CONFIGURED" });

  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("q", normalized);
  url.searchParams.set("count", String(RESULT_COUNT));
  url.searchParams.set("safesearch", "moderate");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      headers: { "accept": "application/json", "x-subscription-token": apiKey.trim() },
      signal: controller.signal,
    });
    if (response.status === 429) throw Object.assign(new Error("Web search capacity is temporarily limited."), { statusCode: 503, errorCode: "WEB_SEARCH_RATE_LIMITED" });
    if (!response.ok) throw Object.assign(new Error("The web search provider returned an error."), { statusCode: 502, errorCode: "WEB_SEARCH_UPSTREAM_ERROR" });
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid search response");
    const web = (payload as Record<string, unknown>).web;
    const results = web && typeof web === "object" ? (web as Record<string, unknown>).results : undefined;
    if (!Array.isArray(results)) throw new Error("Invalid search response");
    return results.slice(0, RESULT_COUNT).flatMap((item): WebSource[] => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const safeUrl = safeHttpsUrl(record.url);
      if (!safeUrl || typeof record.title !== "string" || typeof record.description !== "string") return [];
      return [{
        title: record.title.slice(0, 300),
        url: safeUrl,
        description: record.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1_500),
        ...(typeof record.age === "string" ? { age: record.age.slice(0, 80) } : {}),
      }];
    });
  } catch (error) {
    if (error && typeof error === "object" && "errorCode" in error) throw error;
    if (error instanceof Error && error.name === "AbortError") throw Object.assign(new Error("Web search timed out."), { statusCode: 504, errorCode: "WEB_SEARCH_TIMEOUT" });
    throw Object.assign(new Error("The web search provider is unavailable."), { statusCode: 502, errorCode: "WEB_SEARCH_UNAVAILABLE" });
  } finally { clearTimeout(timeout); }
}
