import { api } from "../api/client";

export type MessageReactionType = "like" | "love" | "haha" | "wow" | "sad" | "angry";
export interface ConversationSummary { id: string; type: string; groupName?: string | null; updatedAt: string; messageCount: number; unreadMessageCount: number; muted: boolean; pinned: boolean; archived: boolean; notificationsEnabled: boolean; mentionsOnly: boolean; lastMessage?: { id: string; message?: string | null; messageType: string; senderId: string; createdAt: string } | null; }
export interface MessageAttachment { id: string; messageId: string; attachmentType: string; fileUrl?: string | null; thumbnailUrl?: string | null; fileName?: string | null; mimeType?: string | null; fileExtension?: string | null; fileSize?: number | null; durationSeconds?: number | null; waveform?: string | null; processingCompleted?: boolean; active?: boolean; }
export interface ReDomMessage { id: string; conversationId: string; senderId: string; messageType: string; message?: string | null; caption?: string | null; parentMessageId?: string | null; sent: boolean; delivered: boolean; read: boolean; reactionCount?: number; edited?: boolean; editedLabel?: boolean; editedAt?: string | null; deletedForEveryone?: boolean; deletedPlaceholder?: boolean; deletedAt?: string | null; createdAt: string; attachment?: MessageAttachment | null; }
export interface ConversationSettings { muted: boolean; pinned: boolean; archived: boolean; notificationsEnabled: boolean; mentionsOnly: boolean; customNotificationSound?: string | null; appWallpaper?: string | null; canJoinCalls: boolean; }
export interface MessageReactionSummary { reactionType: MessageReactionType; total: number; }
export const messageService = {
  listConversations() { return api.get<{ success: boolean; conversations: ConversationSummary[] }>("/messages/conversations"); },
  getMessages(conversationId: string) { return api.get<{ success: boolean; messages: ReDomMessage[]; replyTargets?: ReDomMessage[] }>(`/messages/conversations/${conversationId}`); },
  getSettings(conversationId: string) { return api.get<{ success: boolean; settings: ConversationSettings }>(`/messages/conversations/${conversationId}/settings`); },
  updateSettings(conversationId: string, settings: Partial<ConversationSettings>) { return api.patch<{ success: boolean; settings: ConversationSettings }>(`/messages/conversations/${conversationId}/settings`, settings); },
  createDirect(recipientProfileId: string) { return api.post<{ success: boolean; conversationId: string; existing: boolean }>("/messages/conversations/direct", { recipientProfileId }); },
  sendText(conversationId: string, message: string, parentMessageId?: string) { return api.post<{ success: boolean; message: ReDomMessage }>(`/messages/conversations/${conversationId}/messages`, { message, ...(parentMessageId ? { parentMessageId } : {}) }); },
  sendMedia(conversationId: string, type: "photo" | "voice" | "audio" | "video" | "document" | "gif" | "sticker", dataUri: string, options?: { caption?: string; parentMessageId?: string; durationSeconds?: number; waveform?: number[] }) { return api.post<{ success: boolean; message: ReDomMessage; attachment: MessageAttachment }>(`/messages/conversations/${conversationId}/media`, { type, dataUri, ...options }); },
  editMessage(conversationId: string, messageId: string, message: string) { return api.patch<{ success: boolean; message: ReDomMessage }>(`/messages/conversations/${conversationId}/messages/${messageId}`, { message }); },
  deleteMessage(conversationId: string, messageId: string, scope: "me" | "everyone") { return api.delete<{ success: boolean; scope: "me" | "everyone"; messageId: string; placeholder?: string }>(`/messages/conversations/${conversationId}/messages/${messageId}`, { body: { scope } }); },
  markRead(conversationId: string) { return api.post<{ success: boolean }>(`/messages/conversations/${conversationId}/read`); },
  getReactions(messageId: string) { return api.get<{ success: boolean; reactions: MessageReactionSummary[]; myReaction: MessageReactionType | null }>(`/message-reactions/messages/${messageId}/reactions`); },
  setReaction(messageId: string, reactionType: MessageReactionType) { return api.put<{ success: boolean; reactionType: MessageReactionType }>(`/message-reactions/messages/${messageId}/reactions`, { reactionType }); },
  removeReaction(messageId: string) { return api.delete<{ success: boolean }>(`/message-reactions/messages/${messageId}/reactions`); },
};
