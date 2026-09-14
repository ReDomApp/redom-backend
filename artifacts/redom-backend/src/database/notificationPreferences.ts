import { boolean, pgTable, timestamp, uuid, unique } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pushEnabled: boolean("push_enabled").default(true).notNull(),
  inAppEnabled: boolean("in_app_enabled").default(true).notNull(),
  messageNotifications: boolean("message_notifications").default(true).notNull(),
  groupNotifications: boolean("group_notifications").default(true).notNull(),
  callNotifications: boolean("call_notifications").default(true).notNull(),
  reactionNotifications: boolean("reaction_notifications").default(true).notNull(),
  commentNotifications: boolean("comment_notifications").default(true).notNull(),
  followerNotifications: boolean("follower_notifications").default(true).notNull(),
  friendRequestNotifications: boolean("friend_request_notifications").default(true).notNull(),
  securityNotifications: boolean("security_notifications").default(true).notNull(),
  verificationNotifications: boolean("verification_notifications").default(true).notNull(),
  supportNotifications: boolean("support_notifications").default(true).notNull(),
  showPreviews: boolean("show_previews").default(true).notNull(),
  notificationSounds: boolean("notification_sounds").default(true).notNull(),
  vibration: boolean("vibration").default(true).notNull(),
  appBadge: boolean("app_badge").default(true).notNull(),
  emailNotifications: boolean("email_notifications").default(true).notNull(),
  smsNotifications: boolean("sms_notifications").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({ userIdUnique: unique("notification_preferences_user_unique").on(table.userId) }));
