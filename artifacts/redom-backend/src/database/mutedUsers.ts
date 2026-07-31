import {
  pgTable,
  uuid,
  boolean,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const mutedUsers = pgTable("muted_users", {
  // Internal Mute Record ID
  id: uuid("id").defaultRandom().primaryKey(),

  // User applying the mute
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // User being muted
  mutedUserId: uuid("muted_user_id")
    .notNull()
    .references(() => users.id),

  // ----------------------------
  // CONTENT
  // ----------------------------

  // Hide posts from feed
  mutePosts: boolean("mute_posts")
    .default(false)
    .notNull(),

  // Hide stories
  muteStories: boolean("mute_stories")
    .default(false)
    .notNull(),

  // Hide reels
  muteReels: boolean("mute_reels")
    .default(false)
    .notNull(),

  // Hide notes
  muteNotes: boolean("mute_notes")
    .default(false)
    .notNull(),

  // Hide live videos
  muteLiveVideos: boolean("mute_live_videos")
    .default(false)
    .notNull(),

  // ----------------------------
  // MESSAGES
  // ----------------------------

  // Mute conversation
  muteMessages: boolean("mute_messages")
    .default(false)
    .notNull(),

  // 1_hour
  // 8_hours
  // 24_hours
  // 7_days
  // until_changed
  messageMuteDuration: varchar("message_mute_duration", {
    length: 20,
  })
    .default("until_changed")
    .notNull(),

  // ----------------------------
  // NOTIFICATIONS
  // ----------------------------

  muteNotifications: boolean("mute_notifications")
    .default(false)
    .notNull(),

  // ----------------------------
  // SYSTEM
  // ----------------------------

  mutedAt: timestamp("muted_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});