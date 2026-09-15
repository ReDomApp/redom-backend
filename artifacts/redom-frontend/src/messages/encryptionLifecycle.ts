import { api } from "../api/client";
import { rotateConversationEncryption } from "./e2ee";

export async function revokeDeviceAndRotate(deviceId: string) {
  const result = await api.delete<{ success: boolean; deviceId: string; revoked: boolean; conversationIds?: string[] }>(`/messages/crypto/devices/${encodeURIComponent(deviceId)}`);
  for (const conversationId of result.conversationIds ?? []) {
    try { await rotateConversationEncryption(conversationId); } catch { /* A conversation with no remaining authorized device cannot be rotated from this client. */ }
  }
  return result;
}
