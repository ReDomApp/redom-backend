import { api } from "../api/client";

export type PolicySlug = "terms" | "privacy" | "community" | "messaging" | "notifications" | "security" | "verification" | "ai" | "regional" | "refunds" | "support" | "saved" | "events";
export interface ReDomPolicy { slug: PolicySlug; version: string; effectiveAt: string; document: { title: string; summary: string; sections: Array<{ heading: string; body: string }> } }
export interface ReDomNotification { id: string; notificationType: string; title?: string | null; body?: string | null; actionUrl?: string | null; unread: boolean; createdAt: string }
export interface ReDomSettings { theme: "system" | "light" | "dark"; language: string; politicalContent: boolean; followingFeed: boolean; followingFeedSnooze: string; sensitiveContent: string; autoplayVideos: string; autoTranslatePosts: boolean; autoTranslateComments: boolean; fontSize: "small" | "medium" | "large"; reduceMotion: boolean; highContrast: boolean; screenReaderMode: boolean; captions: string; showJoinDate: boolean }
export interface SavedCollection { id: string; userId: string; name: string; isPublic: boolean; collaborative: boolean; createdAt: string; updatedAt: string }
export interface SavedItem { id: string; contentType: string; contentId: string; collectionId: string | null; favorite: boolean; createdAt: string; content: { id: string; userId: string; content: string | null; type: string; visibility: string; publishedAt: string; deleted: boolean } | null }
export interface SavedFriend { id: string; name: string; profilePhoto: string | null }
export interface NotificationPreferences { pushEnabled: boolean; inAppEnabled: boolean; messageNotifications: boolean; groupNotifications: boolean; callNotifications: boolean; reactionNotifications: boolean; commentNotifications: boolean; followerNotifications: boolean; friendRequestNotifications: boolean; securityNotifications: boolean; verificationNotifications: boolean; supportNotifications: boolean; showPreviews: boolean; notificationSounds: boolean; vibration: boolean; appBadge: boolean; emailNotifications: boolean; smsNotifications: boolean }
export const productService = {
  getPolicy(slug: PolicySlug) { return api.get<{ success: boolean } & ReDomPolicy>(`/product/policies/${slug}`); },
  getNotifications() { return api.get<{ success: boolean; notifications: ReDomNotification[] }>("/product/notifications"); },
  markNotificationRead(id: string) { return api.post<{ success: boolean }>(`/product/notifications/${id}/read`); },
  markAllNotificationsRead() { return api.post<{ success: boolean }>("/product/notifications/read-all"); },
  getSettings() { return api.get<{ success: boolean; settings: ReDomSettings }>("/product/settings"); },
  updateSettings(patch: Partial<ReDomSettings>) { return api.patch<{ success: boolean; settings: ReDomSettings }>("/product/settings", patch); },
  getNotificationPreferences() { return api.get<{ success: boolean; preferences: NotificationPreferences }>("/product/notification-preferences"); },
  updateNotificationPreferences(patch: Partial<NotificationPreferences>) { return api.patch<{ success: boolean; preferences: NotificationPreferences }>("/product/notification-preferences", patch); },
  getSaved(tab: "all" | "reels" | "posts" | "marketplace" | "collections" | "local" = "all") { return api.get<{ success: boolean; tab: string; saved: SavedItem[]; collections: SavedCollection[] }>(`/product/saved?tab=${tab}`); },
  getSavedFriends() { return api.get<{ success: boolean; friends: SavedFriend[] }>("/product/saved/friends"); },
  saveContent(contentType: "post" | "photo" | "video" | "reel" | "page_post" | "marketplace", contentId: string, collectionId?: string | null) { return api.post<{ success: boolean; saved: SavedItem; alreadySaved?: boolean }>("/product/saved", { contentType, contentId, collectionId: collectionId ?? null }); },
  unsaveContent(id: string) { return api.delete<{ success: boolean }>(`/product/saved/${id}`); },
  createSavedCollection(input: { name: string; isPublic: boolean; collaborative: boolean; contributorUserIds: string[] }) { return api.post<{ success: boolean; collection: SavedCollection; contributorUserIds: string[] }>("/product/saved/collections", input); },
};
