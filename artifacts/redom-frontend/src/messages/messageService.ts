import { api } from "../api/client";
import { decryptEnvelopeMap, encryptForRecipient, ensureDeviceKey } from "./e2ee";
import { encryptMediaForParticipants } from "./encryptedMedia";

export type MessageReactionType = "like" | "love" | "haha" | "wow" | "sad" | "angry";
export type DisappearingTimer = 0 | 86400 | 604800 | 7776000;
export interface ConversationSummary { id: string; type: string; groupName?: string | null; updatedAt: string; messageCount: number; unreadMessageCount: number; muted: boolean; pinned: boolean; archived: boolean; notificationsEnabled: boolean; mentionsOnly: boolean; lastMessage?: { id: string; message?: string | null; messageType: string; senderId: string; createdAt: string } | null; }
export interface MessageAttachment { id: string; messageId: string; attachmentType: string; fileUrl?: string | null; thumbnailUrl?: string | null; fileName?: string | null; mimeType?: string | null; fileExtension?: string | null; fileSize?: number | null; durationSeconds?: number | null; waveform?: string | null; processingCompleted?: boolean; active?: boolean; encrypted?: boolean; encryptionVersion?: number | null; viewOnce?: boolean; viewOnceOpened?: boolean; viewOnceExpiresAt?: string | null; }
export interface ReDomMessage { id: string; conversationId: string; senderId: string; messageType: string; message?: string | null; caption?: string | null; parentMessageId?: string | null; sent: boolean; delivered: boolean; read: boolean; reactionCount?: number; edited?: boolean; editedLabel?: boolean; editedAt?: string | null; deletedForEveryone?: boolean; deletedPlaceholder?: boolean; deletedAt?: string | null; createdAt: string; attachment?: MessageAttachment | null; lifecycle?: { viewOnce: boolean; opened: boolean; expiresAt?: string | null; kept: boolean }; encrypted?: boolean; encryptedPayload?: Record<string, unknown> | null; }
export interface ConversationSettings { muted: boolean; pinned: boolean; archived: boolean; notificationsEnabled: boolean; mentionsOnly: boolean; customNotificationSound?: string | null; appWallpaper?: string | null; canJoinCalls: boolean; }
export interface MessageReactionSummary { reactionType: MessageReactionType; total: number; }
export interface CryptoParticipant { profile_id: string; public_key: string | null; algorithm?: string | null; key_version?: number | null; }
export interface CallRecord { id: string; conversationId: string; callType: "voice" | "video"; callStatus: string; participantCount: number; maxParticipants: number; microphoneEnabled: boolean; speakerEnabled: boolean; cameraEnabled: boolean; usingFrontCamera: boolean; encrypted: boolean; }

async function hydrateEncryptedMessages(conversationId: string, rows: ReDomMessage[]): Promise<ReDomMessage[]> { return Promise.all(rows.map(async (message) => { if (!message.encryptedPayload || message.message) return message; const plaintext = await decryptEnvelopeMap(message.encryptedPayload, conversationId).catch(() => null); return plaintext === null ? { ...message, message: "Waiting for encrypted message…" } : { ...message, message: plaintext }; })); }
async function buildEncryptedPayload(conversationId: string, message: string) { await ensureDeviceKey(); const participants = await messageService.getCryptoParticipants(conversationId); const envelopes: Record<string, unknown> = {}; for (const participant of participants.participants) { if (!participant.public_key) throw new Error("This conversation participant has not enabled ReDom encrypted messaging on their current device."); envelopes[participant.profile_id] = await encryptForRecipient(message, participant.public_key, conversationId); } return envelopes; }

export const messageService = {
  listConversations() { return api.get<{ success: boolean; conversations: ConversationSummary[] }>("/messages/conversations"); },
  async getMessages(conversationId: string) { const result = await api.get<{ success: boolean; messages: ReDomMessage[]; replyTargets?: ReDomMessage[] }>(`/messages/conversations/${conversationId}`); return { ...result, messages: await hydrateEncryptedMessages(conversationId, result.messages), replyTargets: result.replyTargets ? await hydrateEncryptedMessages(conversationId, result.replyTargets) : result.replyTargets }; },
  getCompletedMessages(conversationId: string) { return this.getMessages(conversationId); },
  getSettings(conversationId: string) { return api.get<{ success: boolean; settings: ConversationSettings }>(`/messages/conversations/${conversationId}/settings`); },
  updateSettings(conversationId: string, settings: Partial<ConversationSettings>) { return api.patch<{ success: boolean; settings: ConversationSettings }>(`/messages/conversations/${conversationId}/settings`, settings); },
  getDisappearingPolicy(conversationId: string) { return api.get<{ success: boolean; timerSeconds: DisappearingTimer; allowedTimers: DisappearingTimer[] }>(`/messages/conversations/${conversationId}/policy`); },
  setDisappearingPolicy(conversationId: string, timerSeconds: DisappearingTimer) { return api.patch<{ success: boolean; timerSeconds: DisappearingTimer }>(`/messages/conversations/${conversationId}/policy`, { timerSeconds }); },
  setTyping(conversationId: string, typing: boolean) { return api.post<{ success: boolean }>(`/messages/conversations/${conversationId}/typing`, { typing }); },
  getTyping(conversationId: string) { return api.get<{ success: boolean; typing: Array<{ userId: string; isTyping: boolean; typingStartedAt?: string | null }> }>(`/messages/conversations/${conversationId}/typing`); },
  createDirect(recipientProfileId: string) { return api.post<{ success: boolean; conversationId: string; existing: boolean }>("/messages/conversations/direct", { recipientProfileId }); },
  createGroup(name: string, memberProfileIds: string[], description?: string) { return api.post<{ success: boolean; conversationId: string; participantCount: number }>("/messages/groups", { name, memberProfileIds, ...(description ? { description } : {}) }); },
  getGroupMembers(conversationId: string) { return api.get<{ success: boolean; members: Array<{ id: string; profileId: string; role: string; joinedAt: string; online: boolean }> }>(`/messages/groups/${conversationId}/members`); },
  getGroupSettings(conversationId: string) { return api.get<{ success: boolean; settings: any }>(`/messages/groups/${conversationId}/settings`); },
  updateGroupSettings(conversationId: string, patch: Record<string, unknown>) { return api.patch<{ success: boolean }>(`/messages/groups/${conversationId}/settings`, patch); },
  addGroupMembers(conversationId: string, profileIds: string[]) { return api.post<{ success: boolean; added: number; pending: number }>(`/messages/groups/${conversationId}/members`, { profileIds }); },
  removeGroupMember(conversationId: string, profileId: string) { return api.delete<{ success: boolean; removed: boolean }>(`/messages/groups/${conversationId}/members/${profileId}`); },
  setGroupMemberRole(conversationId: string, profileId: string, role: "admin" | "member") { return api.patch<{ success: boolean; role: string }>(`/messages/groups/${conversationId}/members/${profileId}/role`, { role }); },
  leaveGroup(conversationId: string) { return api.post<{ success: boolean; left: boolean }>(`/messages/groups/${conversationId}/leave`); },
  requestGroupJoin(conversationId: string) { return api.post<{ success: boolean; pending?: boolean }>(`/messages/groups/${conversationId}/join-request`); },
  getGroupJoinRequests(conversationId: string) { return api.get<{ success: boolean; requests: Array<{ id: string; profileId: string; requestedAt: string }> }>(`/messages/groups/${conversationId}/join-requests`); },
  approveGroupJoinRequest(conversationId: string, profileId: string) { return api.post<{ success: boolean; approved: boolean }>(`/messages/groups/${conversationId}/join-requests/${profileId}/approve`); },
  rejectGroupJoinRequest(conversationId: string, profileId: string) { return api.post<{ success: boolean; rejected: boolean }>(`/messages/groups/${conversationId}/join-requests/${profileId}/reject`); },
  async ensureEncryptionKey() { const { publicKey } = await ensureDeviceKey(); return api.put<{ success: boolean; profileId: string; publicKey: string }>("/messages/crypto/device-key", { publicKey }); },
  getCryptoParticipants(conversationId: string) { return api.get<{ success: boolean; participants: CryptoParticipant[] }>(`/messages/crypto/conversations/${conversationId}/crypto-participants`); },
  async sendText(conversationId: string, message: string, parentMessageId?: string) { const envelopes = await buildEncryptedPayload(conversationId, message); return api.post<{ success: boolean; message: ReDomMessage }>(`/messages/conversations/${conversationId}/messages`, { encryptedPayload: envelopes, ...(parentMessageId ? { parentMessageId } : {}) }); },
  async editMessage(conversationId: string, messageId: string, message: string) { const encryptedPayload = await buildEncryptedPayload(conversationId, message); return api.patch<{ success: boolean; message: ReDomMessage }>(`/messages/conversations/${conversationId}/messages/${messageId}`, { encryptedPayload }); },
  sendEncryptedText(conversationId: string, encryptedPayload: Record<string, unknown>, parentMessageId?: string) { return api.post<{ success: boolean; message: ReDomMessage }>(`/messages/conversations/${conversationId}/messages`, { encryptedPayload, ...(parentMessageId ? { parentMessageId } : {}) }); },
  sendMedia(conversationId: string, type: "photo" | "voice" | "audio" | "video" | "document" | "gif" | "sticker", dataUri: string, options?: { caption?: string; parentMessageId?: string; durationSeconds?: number; waveform?: number[]; viewOnce?: boolean }) { return api.post<{ success: boolean; message: ReDomMessage; attachment: MessageAttachment }>(`/messages/conversations/${conversationId}/media`, { type, dataUri, ...options }); },
  async sendEncryptedMedia(conversationId: string, type: "photo" | "video" | "voice" | "audio" | "document" | "gif" | "sticker", dataUri: string, options?: { caption?: string; parentMessageId?: string; durationSeconds?: number; waveform?: number[]; viewOnce?: boolean }) {
    await ensureDeviceKey();
    const participants = await messageService.getCryptoParticipants(conversationId);
    const encrypted = await encryptMediaForParticipants(dataUri, participants.participants, conversationId);
    return api.post<{ success: boolean; message: ReDomMessage; attachment: MessageAttachment }>(`/messages/conversations/${conversationId}/encrypted-media`, {
      type,
      ciphertextDataUri: encrypted.ciphertextDataUri,
      mimeType: encrypted.mime,
      mediaEnvelopes: encrypted.envelopes,
      ...(options ?? {}),
    });
  },
  getEncryptedMediaKey(messageId: string) { return api.get<{ success: boolean; envelope: { version: 1; algorithm: "X25519-AES-256-GCM"; ephemeralPublicKey: string; encryptedMediaKey: string } }>(`/messages/messages/${messageId}/media-key`); },
  getAttachment(messageId: string) { return api.get<{ success: boolean; attachment: MessageAttachment }>(`/messages/messages/${messageId}/attachment`); },
  deleteMessage(conversationId: string, messageId: string, scope: "me" | "everyone") { return api.delete<{ success: boolean; scope: "me" | "everyone"; messageId: string; placeholder?: string }>(`/messages/conversations/${conversationId}/messages/${messageId}`, { scope }); },
  markRead(conversationId: string) { return api.post<{ success: boolean }>(`/messages/conversations/${conversationId}/read`); },
  markViewOnce(messageId: string) { return api.post<{ success: boolean; messageId: string; viewOnce: boolean }>(`/messages/messages/${messageId}/view-once`); },
  openViewOnce(messageId: string) { return api.post<{ success: boolean; message: ReDomMessage; openedAt: string }>(`/messages/messages/${messageId}/open-view-once`); },
  reportMessage(messageId: string, reason: string, details?: string, blockSender = false) { return api.post<{ success: boolean; reported: boolean; blocked: boolean }>(`/messages/messages/${messageId}/report`, { reason, ...(details ? { details } : {}), blockSender }); },
  blockProfile(profileId: string) { return api.post<{ success: boolean; blocked: boolean }>(`/messages/block/${profileId}`); },
  unblockProfile(profileId: string) { return api.delete<{ success: boolean; blocked: boolean }>(`/messages/block/${profileId}`); },
  blockStatus(profileId: string) { return api.get<{ success: boolean; blocked: boolean }>(`/messages/block/${profileId}/status`); },
  createCall(conversationId: string, callType: "voice" | "video") { return api.post<{ success: boolean; call: CallRecord }>(`/calls/conversations/${conversationId}`, { callType }); },
  updateCall(callId: string, update: Record<string, unknown>) { return api.patch<{ success: boolean; call: CallRecord }>(`/calls/${callId}`, update); },
  sendCallSignal(callId: string, signalType: "offer" | "answer" | "ice" | "renegotiate" | "bye", payload: Record<string, unknown>) { return api.post<{ success: boolean }>(`/messages/calls/${callId}/signals`, { signalType, payload }); },
  getCallSignals(callId: string, since?: string) { return api.get<{ success: boolean; signals: Array<{ id: string; sender_id: string; signal_type: string; payload: Record<string, unknown>; created_at: string }> }>(`/messages/calls/${callId}/signals${since ? `?since=${encodeURIComponent(since)}` : ""}`); },
  getReactions(messageId: string) { return api.get<{ success: boolean; reactions: MessageReactionSummary[]; myReaction: MessageReactionType | null }>(`/message-reactions/messages/${messageId}/reactions`); },
  setReaction(messageId: string, reactionType: MessageReactionType) { return api.put<{ success: boolean; reactionType: MessageReactionType }>(`/message-reactions/messages/${messageId}/reactions`, { reactionType }); },
  removeReaction(messageId: string) { return api.delete<{ success: boolean }>(`/message-reactions/messages/${messageId}/reactions`); },
};
