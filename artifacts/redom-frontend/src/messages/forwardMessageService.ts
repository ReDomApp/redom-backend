import { api } from "../api/client";
import { encryptForRecipient, ensureDeviceKey } from "./e2ee";
import { messageService, type CryptoParticipant, type ReDomMessage } from "./messageService";

async function registerCurrentDevice() {
  const device = await ensureDeviceKey();
  await api.put<{ success: boolean; deviceId: string }>("/messages/crypto/device-key", {
    deviceId: device.deviceId,
    publicKey: device.publicKey,
    platform: "Android",
    deviceLabel: "ReDom device",
  });
  return device;
}

async function encryptForConversation(conversationId: string, plaintext: string) {
  const device = await registerCurrentDevice();
  const result = await messageService.getCryptoParticipants(conversationId);
  const envelopes: Record<string, unknown> = {};
  for (const participant of result.participants as CryptoParticipant[]) {
    if (!participant.public_key || !participant.device_id) throw new Error("A selected chat participant is missing an encryption device.");
    envelopes[participant.device_id] = await encryptForRecipient(plaintext, participant.public_key, conversationId);
  }
  if (!envelopes[device.deviceId]) throw new Error("This ReDom device is not registered for encrypted messaging.");
  return envelopes;
}

export const forwardMessageService = {
  async forwardText(sourceMessage: ReDomMessage, destinationConversationIds: string[]) {
    const plaintext = sourceMessage.message || sourceMessage.caption || "";
    if (!plaintext) throw new Error("Only readable message content can be forwarded from this action.");
    if (sourceMessage.lifecycle?.viewOnce) throw new Error("View Once messages cannot be forwarded.");
    const uniqueDestinations = [...new Set(destinationConversationIds)];
    if (!uniqueDestinations.length || uniqueDestinations.length > 5) throw new Error("Select between one and five chats.");
    const forwards = await Promise.all(uniqueDestinations.map(async (conversationId) => ({
      conversationId,
      encryptedPayload: await encryptForConversation(conversationId, plaintext),
    })));
    return api.post<{
      success: boolean;
      sourceMessageId: string;
      forwardedCount: number;
      forwardedMany: boolean;
      messages: ReDomMessage[];
    }>("/messages/forward", { sourceMessageId: sourceMessage.id, forwards });
  },
};
