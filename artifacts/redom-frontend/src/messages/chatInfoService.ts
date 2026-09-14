import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";
import { messageService, type CryptoParticipant } from "./messageService";

export interface ChatInfoSettings { advancedChatPrivacy: boolean; mediaVisibility: boolean; favorite: boolean; listName: string | null; wallpaper: string | null; notificationsEnabled: boolean; muted: boolean; }

const lockKey = (conversationId: string) => `redom.chat.lock.${conversationId}`;

export const chatInfoService = {
  getSettings(conversationId: string) { return api.get<{ success: boolean; settings: ChatInfoSettings }>(`/messages/conversations/${encodeURIComponent(conversationId)}/chat-info-settings`); },
  updateSettings(conversationId: string, patch: Partial<ChatInfoSettings>) { return api.patch<{ success: boolean; settings: ChatInfoSettings }>(`/messages/conversations/${encodeURIComponent(conversationId)}/chat-info-settings`, patch); },
  starMessage(messageId: string) { return api.post<{ success: boolean; starred: boolean }>(`/messages/messages/${encodeURIComponent(messageId)}/star`, {}); },
  unstarMessage(messageId: string) { return api.delete<{ success: boolean; starred: boolean }>(`/messages/messages/${encodeURIComponent(messageId)}/star`); },
  getStarredMessages() { return api.get<{ success: boolean; messages: Array<{ messageId: string; conversationId: string; senderId: string; messageType: string; caption?: string | null; createdAt: string; starredAt: string }> }>("/messages/starred-messages"); },
  clearChat(conversationId: string) { return api.post<{ success: boolean; cleared: number }>(`/messages/conversations/${encodeURIComponent(conversationId)}/clear`, {}); },
  async getChatLock(conversationId: string) { return (await AsyncStorage.getItem(lockKey(conversationId))) === "1"; },
  async setChatLock(conversationId: string, enabled: boolean) { await AsyncStorage.setItem(lockKey(conversationId), enabled ? "1" : "0"); return enabled; },
  async encryptionFingerprint(conversationId: string) {
    const result = await messageService.getCryptoParticipants(conversationId);
    return result.participants as CryptoParticipant[];
  },
};
