import { ApiError } from "../api/client";

/**
 * Single frontend gateway for IPAPI's public-IP endpoint.
 *
 * This request intentionally stays keyless: it only asks IPAPI to return the
 * public IP visible from the device's current Wi-Fi/mobile connection.
 * Secret IPAPI_API_KEY usage remains server-side in the backend client.
 */
export const IPAPI_ENDPOINT = "https://api.ipapi.is";

const REQUEST_TIMEOUT_MS = 8_000;
const IPAPI_ENDPOINTS = ["https://api.ipapi.is", "https://us.ipapi.is"];

export async function getPublicIp(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let response: Response | null = null;
    let lastError: unknown = null;

    for (const endpoint of IPAPI_ENDPOINTS) {
      try {
        response = await fetch(endpoint, {
      method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!response) {
      throw lastError instanceof Error ? lastError : new Error("Unable to connect to IPAPI.");
    }

    let payload: { ip?: unknown; error?: unknown; error_code?: unknown };
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      throw new ApiError(
        "IPAPI returned an invalid response.",
        response.status || 502,
        "IPAPI_INVALID_RESPONSE",
      );
    }

    if (!response.ok || typeof payload.ip !== "string" || !payload.ip.trim()) {
      const code =
        typeof payload.error_code === "string"
          ? payload.error_code
          : "IP_LOOKUP_FAILED";
      throw new ApiError(
        `Public IP detection failed (${code}).`,
        response.status || 503,
        code,
        payload,
      );
    }

    return payload.ip.trim();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(
        "IPAPI public IP detection timed out.",
        504,
        "IPAPI_TIMEOUT",
      );
    }

    throw new ApiError(
      error instanceof Error && error.message
        ? `IPAPI public IP detection failed: ${error.message}`
        : "IPAPI public IP detection failed.",
      503,
      "IPAPI_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timeout);
  }
}
