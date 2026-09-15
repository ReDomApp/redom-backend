import { api } from "../api/client";
import { rotateConversationEncryption } from "./e2ee";

export async function revokeDeviceAndRotate(deviceId: string) {
  const result = await api.delete<{ success: boolean; deviceId: string; revoked: boolean; conversationIds?: string[]; encryptionRotationRequired?: boolean }>(`/messages/crypto/devices/${encodeURIComponent(deviceId)}`);
  for (const conversationId of result.conversationIds ?? []) await rotateConversationEncryption(conversationId);
  return result;
}
