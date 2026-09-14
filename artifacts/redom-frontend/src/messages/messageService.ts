import { api } from "../api/client";

export type MessageReactionType = "like" | "love" | "haha" | "wow" | "sad" | "angry";
export type DisappearingTimer = 0 | 86400 | 604800 | 7776000;
export interface ConversationSummary { id: string; type: string; groupName?: string | null; updatedAt: string; messageCount: number; unreadMessageCount: number; muted: boolean; pinned: boolean; archived: boolean; notificationsEnabled: boolean; mentionsOnly: boolean; lastMessage?: { id: string; message?: string | null; messageType: string; senderId: string; createdAt: string } | null; }
export interface MessageAttachment { id: string; messageId: string; attachmentType: string; fileUrl?: string | null; thumbnailUrl?: string | null; fileName?: string | null; mimeType?: string | null; fileExtension?: string | null; fileSize?: number | null; durationSeconds?: number | null; waveform?: string | null; processingCompleted?: boolean; active?: boolean; }
export interface ReDomMessage { id: string; conversationId: string; senderId: string; messageType: string; message?: string | null; caption?: string | null; parentMessageId?: string | null; sent: boolean; delivered: boolean; read: boolean; reactionCount?: number; edited?: boolean; editedLabel?: boolean; editedAt?: string | null; deletedForEveryone?: boolean; deletedPlaceholder?: boolean; deletedAt?: string | null; createdAt: string; attachment?: MessageAttachment | null; lifecycle?: { viewOnce: boolean; opened: boolean; expiresAt?: string | null; kept: boolean }; }
export interface ConversationSettings { muted: boolean; pinned: boolean; archived: boolean; notificationsEnabled: boolean; mentionsOnly: boolean; customNotificationSound?: string | null; appWallpaper?: string | null; canJoinCalls: boolean; }
export interface MessageReactionSummary { reactionType: MessageReactionType; total: number; }
export const messageService = {
  listConversations() { return api.get<{ success: boolean; conversations: ConversationSummary[] }>("/messages/conversations"); },
  getMessages(conversationId: string) { return api.get<{ success: boolean; messages: ReDomMessage[]; replyTargets?: ReDomMessage[] }>(`/messages/conversations/${conversationId}`); },
  getCompletedMessages(conversationId: string) { return api.get<{ success: boolean; messages: ReDomMessage[]; replyTargets?: ReDomMessage[] }>(`/messages/conversations/${conversationId}`); },
  getSettings(conversationId: string) { return api.get<{ success: boolean; settings: ConversationSettings }>(`/messages/conversations/${conversationId}/settings`); },
  updateSettings(conversationId: string, settings: Partial<ConversationSettings>) { return api.patch<{ success: boolean; settings: ConversationSettings }>(`/messages/conversations/${conversationId}/settings`, settings); },
  getDisappearingPolicy(conversationId: string) { return api.get<{ success: boolean; timerSeconds: DisappearingTimer; allowedTimers: DisappearingTimer[] }>(`/messages/conversations/${conversationId}/policy`); },
  setDisappearingPolicy(conversationId: string, timerSeconds: DisappearingTimer) { return api.patch<{ success: boolean; timerSeconds: DisappearingTimer }>(`/messages/conversations/${conversationId}/policy`, { timerSeconds }); },
  setTyping(conversationId: string, typing: boolean) { return api.post<{ success: boolean }>(`/messages/conversations/${conversationId}/typing`, { typing }); },
  getTyping(conversationId: string) { return api.get<{ success: boolean; typing: Array<{ userId: string; isTyping: boolean; typingStartedAt?: string | null }> }>(`/messages/conversations/${conversationId}/typing`); },
  createDirect(recipientProfileId: string) { return api.post<{ success: boolean; conversationId: string; existing: boolean }>("/messages/conversations/direct", { recipientProfileId }); },
  createGroup(name: string, memberProfileIds: string[], description?: string) { return api.post<{ success: boolean; conversationId: string; participantCount: number }>("/messages/groups", { name, memberProfileIds, ...(description ? { description } : {}) }); },
  getGroupMembers(conversationId: string) { return api.get<{ success: boolean; members: Array<{ id: string; profileId: string; role: string; joinedAt: string; online: boolean }> }>(`/messages/groups/${conversationId}/members`); },
  updateGroupMember(conversationId: string, profileId: string, role: "admin" | "member", active?: boolean) { return api.patch<{ success: boolean }>(`/messages/groups/${conversationId}/members/${profileId}`, { role, ...(active === undefined ? {} : { active }) }); },
  sendText(conversationId: string, message: string, parentMessageId?: string) { return api.post<{ success: boolean; message: ReDomMessage }>(`/messages/conversations/${conversationId}/messages`, { message, ...(parentMessageId ? { parentMessageId } : {}) }); },
  sendMedia(conversationId: string, type: "photo" | "voice" | "audio" | "video" | "document" | "gif" | "sticker", dataUri: string, options?: { caption?: string; parentMessageId?: string; durationSeconds?: number; waveform?: number[] }) { return api.post<{ success: boolean; message: ReDomMessage; attachment: MessageAttachment }>(`/messages/conversations/${conversationId}/media`, { type, dataUri, ...options }); },
  getAttachment(messageId: string) { return api.get<{ success: boolean; attachment: MessageAttachment }>(`/messages/messages/${messageId}/attachment`); },
  editMessage(conversationId: string, messageId: string, message: string) { return api.patch<{ success: boolean; message: ReDomMessage }>(`/messages/conversations/${conversationId}/messages/${messageId}`, { message }); },
  deleteMessage(conversationId: string, messageId: string, scope: "me" | "everyone") { return api.delete<{ success: boolean; scope: "me" | "everyone"; messageId: string; placeholder?: string }>(`/messages/conversations/${conversationId}/messages/${messageId}`, { scope }); },
  markRead(conversationId: string) { return api.post<{ success: boolean }>(`/messages/conversations/${conversationId}/read`); },
  markViewOnce(messageId: string) { return api.post<{ success: boolean; messageId: string; viewOnce: boolean }>(`/messages/messages/${messageId}/view-once`); },
  openViewOnce(messageId: string) { return api.post<{ success: boolean; message: ReDomMessage; openedAt: string }>(`/messages/messages/${messageId}/open-view-once`); },
  reportMessage(messageId: string, reason: string, details?: string, blockSender = false) { return api.post<{ success: boolean; reported: boolean; blocked: boolean }>(`/messages/messages/${messageId}/report`, { reason, ...(details ? { details } : {}), blockSender }); },
  blockProfile(profileId: string) { return api.post<{ success: boolean; blocked: boolean }>(`/messages/block/${profileId}`); },
  unblockProfile(profileId: string) { return api.delete<{ success: boolean; blocked: boolean }>(`/messages/block/${profileId}`); },
  blockStatus(profileId: string) { return api.get<{ success: boolean; blocked: boolean }>(`/messages/block/${profileId}/status`); },
  sendCallSignal(callId: string, signalType: "offer" | "answer" | "ice" | "renegotiate" | "bye", payload: Record<string, unknown>) { return api.post<{ success: boolean }>(`/messages/calls/${callId}/signals`, { signalType, payload }); },
  getCallSignals(callId: string, since?: string) { return api.get<{ success: boolean; signals: Array<{ id: string; sender_id: string; signal_type: string; payload: Record<string, unknown>; created_at: string }> }>(`/messages/calls/${callId}/signals${since ? `?since=${encodeURIComponent(since)}` : ""}`); },
  getReactions(messageId: string) { return api.get<{ success: boolean; reactions: MessageReactionSummary[]; myReaction: MessageReactionType | null }>(`/message-reactions/messages/${messageId}/reactions`); },
  setReaction(messageId: string, reactionType: MessageReactionType) { return api.put<{ success: boolean; reactionType: MessageReactionType }>(`/message-reactions/messages/${messageId}/reactions`, { reactionType }); },
  removeReaction(messageId: string) { return api.delete<{ success: boolean }>(`/message-reactions/messages/${messageId}/reactions`); },
};
