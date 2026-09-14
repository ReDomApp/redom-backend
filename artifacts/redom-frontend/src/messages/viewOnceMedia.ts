import { env } from "../config/env";
import { getStoredSession } from "../auth/storage";
import { decryptMedia, decryptMediaKey } from "./encryptedMedia";
import { getDeviceId } from "./e2ee";
import type { ReDomMessage } from "./messageService";

function absoluteUrl(fileUrl: string) { return /^https?:\/\//i.test(fileUrl) ? fileUrl : `${env.apiBaseUrl}${fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`}`; }
function conversationIdFromFileUrl(fileUrl: string) { const match = /\/messages\/media\/messages\/([^/]+)\//.exec(fileUrl); return match?.[1] ?? null; }
function bytesToBase64(bytes: Uint8Array) { let out = ""; const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) out += String.fromCharCode(...bytes.subarray(i, i + chunk)); return globalThis.btoa(out); }

export async function loadViewOnceMedia(message: ReDomMessage) {
  const fileUrl = message.attachment?.fileUrl;
  if (!fileUrl) throw new Error("View Once media is unavailable.");
  const session = await getStoredSession();
  if (!session?.accessToken) throw new Error("Authentication required.");
  const response = await fetch(absoluteUrl(fileUrl), { headers: { Authorization: `Bearer ${session.accessToken}` }, cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 410 ? "This View Once message has already been opened or expired." : "View Once media is unavailable.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const mime = response.headers.get("X-ReDom-Media-Mime") || response.headers.get("Content-Type") || message.attachment?.mimeType || "application/octet-stream";
  if (response.headers.get("X-ReDom-Media-Encrypted") === "1") {
    const messageId = response.headers.get("X-ReDom-Media-Message-Id") || message.id;
    const conversationId = conversationIdFromFileUrl(fileUrl) || message.conversationId;
    const deviceId = await getDeviceId();
    const keyResult = await fetch(`${env.apiBaseUrl}/messages/messages/${messageId}/media-key?deviceId=${encodeURIComponent(deviceId)}`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
    if (!keyResult.ok) throw new Error("The encrypted View Once key is unavailable for this device.");
    const keyBody = await keyResult.json();
    const mediaKey = await decryptMediaKey(keyBody.envelope, conversationId, deviceId);
    return decryptMedia(bytesToBase64(bytes), mediaKey, mime);
  }
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}
