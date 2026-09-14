import { api } from "../api/client";

export type MessageReactionType = "like" | "love" | "haha" | "wow" | "sad" | "angry";
export interface ConversationSummary { id: string; type: string; groupName?: string | null; updatedAt: string; messageCount: number; unreadMessageCount: number; muted: boolean; pinned: boolean; archived: boolean; notificationsEnabled: boolean; mentionsOnly: boolean; lastMessage?: { id: string; message?: string | null; messageType: string; senderId: string; createdAt: string } | null; }
export interface ReDomMessage { id: string; conversationId: string; senderId: string; messageType: string; message?: string | null; parentMessageId?: string | null; sent: boolean; delivered: boolean; read: boolean; reactionCount?: number; createdAt: string; }
export interface ConversationSettings { muted: boolean; pinned: boolean; archived: boolean; notificationsEnabled: boolean; mentionsOnly: boolean; customNotificationSound?: string | null; appWallpaper?: string | null; canJoinCalls: boolean; }
export interface MessageReactionSummary { reactionType: MessageReactionType; total: number; }
export const messageService = {
  listConversations() { return api.get<{ success: boolean; conversations: ConversationSummary[] }>("/messages/conversations"); },
  getMessages(conversationId: string) { return api.get<{ success: boolean; messages: ReDomMessage[] }>(`/messages/conversations/${conversationId}`); },
  getSettings(conversationId: string) { return api.get<{ success: boolean; settings: ConversationSettings }>(`/messages/conversations/${conversationId}/settings`); },
  updateSettings(conversationId: string, settings: Partial<ConversationSettings>) { return api.patch<{ success: boolean; settings: ConversationSettings }>(`/messages/conversations/${conversationId}/settings`, settings); },
  createDirect(recipientProfileId: string) { return api.post<{ success: boolean; conversationId: string; existing: boolean }>("/messages/conversations/direct", { recipientProfileId }); },
  sendText(conversationId: string, message: string, parentMessageId?: string) { return api.post<{ success: boolean; message: ReDomMessage }>(`/messages/conversations/${conversationId}/messages`, { message, ...(parentMessageId ? { parentMessageId } : {}) }); },
  markRead(conversationId: string) { return api.post<{ success: boolean }>(`/messages/conversations/${conversationId}/read`); },
  getReactions(messageId: string) { return api.get<{ success: boolean; reactions: MessageReactionSummary[]; myReaction: MessageReactionType | null }>(`/message-reactions/messages/${messageId}/reactions`); },
  setReaction(messageId: string, reactionType: MessageReactionType) { return api.put<{ success: boolean; reactionType: MessageReactionType }>(`/message-reactions/messages/${messageId}/reactions`, { reactionType }); },
  removeReaction(messageId: string) { return api.delete<{ success: boolean }>(`/message-reactions/messages/${messageId}/reactions`); },
};
