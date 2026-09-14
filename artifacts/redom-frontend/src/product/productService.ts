import { api } from "../api/client";

export type PolicySlug = "terms" | "privacy" | "community" | "messaging" | "notifications" | "security" | "verification" | "ai" | "regional" | "refunds" | "support";
export interface ReDomPolicy { slug: PolicySlug; version: string; effectiveAt: string; document: { title: string; summary: string; sections: Array<{ heading: string; body: string }> } }
export interface ReDomNotification { id: string; notificationType: string; title?: string | null; body?: string | null; actionUrl?: string | null; unread: boolean; createdAt: string }
export interface ReDomSettings { theme: "system" | "light" | "dark"; language: string; politicalContent: boolean; followingFeed: boolean; followingFeedSnooze: string; sensitiveContent: string; autoplayVideos: string; autoTranslatePosts: boolean; autoTranslateComments: boolean; fontSize: "small" | "medium" | "large"; reduceMotion: boolean; highContrast: boolean; screenReaderMode: boolean; captions: string; showJoinDate: boolean }
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
};
