import { api } from "../api/client";

export interface ConversationSummary { id: string; type: string; groupName?: string | null; updatedAt: string; messageCount: number; unreadMessageCount: number; muted: boolean; pinned: boolean; archived: boolean; lastMessage?: { id: string; message?: string | null; messageType: string; senderId: string; createdAt: string } | null; }
export interface ReDomMessage { id: string; conversationId: string; senderId: string; messageType: string; message?: string | null; parentMessageId?: string | null; sent: boolean; delivered: boolean; read: boolean; createdAt: string; }
export const messageService = {
  listConversations() { return api.get<{ success: boolean; conversations: ConversationSummary[] }>("/messages/conversations"); },
  getMessages(conversationId: string) { return api.get<{ success: boolean; messages: ReDomMessage[] }>(`/messages/conversations/${conversationId}`); },
  createDirect(recipientProfileId: string) { return api.post<{ success: boolean; conversationId: string; existing: boolean }>("/messages/conversations/direct", { recipientProfileId }); },
  sendText(conversationId: string, message: string, parentMessageId?: string) { return api.post<{ success: boolean; message: ReDomMessage }>(`/messages/conversations/${conversationId}/messages`, { message, ...(parentMessageId ? { parentMessageId } : {}) }); },
  markRead(conversationId: string) { return api.post<{ success: boolean }>(`/messages/conversations/${conversationId}/read`); },
};
