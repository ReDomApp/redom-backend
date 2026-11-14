import { randomUUID } from "node:crypto";

const timeoutMs = 12_000;

function resendApiKey(): string {
  const key = process.env.AURELINK_RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (!key) throw new Error("Resend API key management is not configured.");
  return key;
}

async function resendRequest(path: string, method: "POST" | "DELETE", body?: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.resend.com" + path, {
      method,
      headers: {
        authorization: "Bearer " + resendApiKey(),
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: any = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { message: text.slice(0, 300) }; }
    if (!response.ok) {
      const detail = parsed?.message || parsed?.error?.message || parsed?.name || "Resend rejected the API-key request.";
      throw new Error("Resend API-key operation failed (" + response.status + "): " + String(detail).slice(0, 250));
    }
    return parsed?.data ?? parsed;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Resend API-key operation timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Creates a Resend sending-only key scoped to one already-verified customer domain. */
export async function createAurelinkResendSmtpKey(input: {
  workspaceId: string;
  domainId: string;
  label: string;
}): Promise<{ providerKeyId: string; token: string }> {
  const label = input.label.replace(/[^A-Za-z0-9 _.-]/g, "").trim().slice(0, 24) || "SMTP";
  const name = ("AL " + input.workspaceId.slice(0, 8) + " " + label + " " + randomUUID().slice(0, 6)).slice(0, 50);
  const result = await resendRequest("/api-keys", "POST", {
    name,
    permission: "sending_access",
    domain_id: input.domainId,
  });
  if (!result?.id || !result?.token || !String(result.token).startsWith("re_")) {
    throw new Error("Resend did not return a usable sending-only API key.");
  }
  return { providerKeyId: String(result.id), token: String(result.token) };
}

export async function revokeAurelinkResendSmtpKey(providerKeyId: string): Promise<void> {
  if (!providerKeyId || !/^[A-Za-z0-9_-]{3,180}$/.test(providerKeyId)) {
    throw new Error("Invalid Resend API-key identifier.");
  }
  await resendRequest("/api-keys/" + encodeURIComponent(providerKeyId), "DELETE");
}
