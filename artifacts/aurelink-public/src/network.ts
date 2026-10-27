export type PublicNetwork = { ip: string; status: "checked" };
const IP_ENDPOINTS = ["https://api.ipapi.is", "https://us.ipapi.is"] as const;
const TIMEOUT_MS = 8000;

/** Browser-side discovery only. The backend performs the authoritative reputation decision. */
export async function getPublicIp(): Promise<string> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  let lastError: unknown = null;
  try {
    for (const endpoint of IP_ENDPOINTS) {
      try {
        const response = await fetch(endpoint, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
        const payload: { ip?: unknown; error?: unknown; error_code?: unknown } = await response.json();
        if (response.ok && typeof payload.ip === "string" && payload.ip.trim()) return payload.ip.trim();
        lastError = new Error(typeof payload.error === "string" ? payload.error : "Public IP detection failed (" + (payload.error_code || response.status) + ").");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw new Error("Public IP detection timed out. Check your connection and try again.");
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Unable to determine your public IP address.");
  } finally { window.clearTimeout(timeout); }
}
