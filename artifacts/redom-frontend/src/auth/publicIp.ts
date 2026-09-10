import { ApiError } from "../api/client";

const IPAPI_PUBLIC_ENDPOINT = "https://api.ipapi.is/";
const TIMEOUT_MS = 8_000;

/**
 * Gets the handset's current public Internet address directly from IPAPI.
 * This endpoint is intentionally keyless: the authenticated IPAPI key never
 * ships inside the Expo application bundle.
 */
export async function detectPublicIp(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(IPAPI_PUBLIC_ENDPOINT, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as { ip?: unknown; error?: unknown; error_code?: unknown } | null;
    if (!response.ok || typeof payload?.ip !== "string" || !payload.ip.trim()) {
      const message = typeof payload?.error === "string" ? payload.error : "Unable to detect the current public IP address.";
      throw new ApiError(message, typeof payload?.error_code === "string" ? payload.error_code : "PUBLIC_IP_UNAVAILABLE", response.status);
    }

    return payload.ip.trim();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("Public IP detection timed out. Please check your Internet connection and try again.", "PUBLIC_IP_TIMEOUT", 408);
    }
    throw new ApiError("Unable to detect the current public IP address.", "PUBLIC_IP_UNAVAILABLE", 503);
  } finally {
    clearTimeout(timer);
  }
}
