import { ApiError } from "../api/client";

/**
 * Keyless public-IP discovery from the handset's current Wi-Fi/mobile
 * connection. The authenticated IPAPI lookup remains server-side.
 */
export const IPAPI_ENDPOINT = "https://api.ipapi.is";

const REQUEST_TIMEOUT_MS = 8_000;
const IPAPI_ENDPOINTS = ["https://api.ipapi.is", "https://us.ipapi.is"];

function isUsablePublicIp(value: string): boolean {
  const ip = value.trim();
  if (!ip) return false;
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    return lower !== "::" && lower !== "::1" &&
      !lower.startsWith("fc") && !lower.startsWith("fd") &&
      !lower.startsWith("fe8") && !lower.startsWith("fe9") &&
      !lower.startsWith("fea") && !lower.startsWith("feb");
  }

  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;

  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

export async function getPublicIp(): Promise<string> {
  let lastError: unknown = null;

  for (const endpoint of IPAPI_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      let payload: { ip?: unknown; error?: unknown; error_code?: unknown };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        lastError = new ApiError("IPAPI returned an invalid response.", response.status || 502, "IPAPI_INVALID_RESPONSE");
        continue;
      }

      if (!response.ok || typeof payload.ip !== "string" || !isUsablePublicIp(payload.ip)) {
        const code = typeof payload.error_code === "string" ? payload.error_code : "IP_LOOKUP_FAILED";
        lastError = new ApiError(
          "IPAPI did not return a usable public IP.",
          response.status || 503,
          code,
          payload,
        );
        continue;
      }

      return payload.ip.trim();
    } catch (error) {
      lastError = error instanceof Error && error.name === "AbortError"
        ? new ApiError("IPAPI public IP detection timed out.", 504, "IPAPI_TIMEOUT")
        : error instanceof Error
          ? new ApiError(`IPAPI public IP detection failed: ${error.message}`, 503, "IPAPI_UNAVAILABLE")
          : new ApiError("IPAPI public IP detection failed.", 503, "IPAPI_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof ApiError
    ? lastError
    : new ApiError("IPAPI public IP detection failed.", 503, "IPAPI_UNAVAILABLE");
}