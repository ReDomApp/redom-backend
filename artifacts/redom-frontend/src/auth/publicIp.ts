import { ApiError } from "../api/client";

const IPAPI_PUBLIC_ENDPOINT = "https://api.ipapi.is";
const IP_LOOKUP_TIMEOUT_MS = 8_000;

export async function detectPublicIp(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IP_LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(IPAPI_PUBLIC_ENDPOINT, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    const payload = (await response.json()) as { ip?: unknown; error?: unknown; error_code?: unknown };

    if (!response.ok || typeof payload.ip !== "string" || !payload.ip.trim()) {
      const code = typeof payload.error_code === "string" ? payload.error_code : "IP_LOOKUP_FAILED";
      throw new ApiError(`Public IP detection failed (${code}).`, response.status || 503, code, payload);
    }

    return payload.ip.trim();
  } finally {
    clearTimeout(timeout);
  }
}
