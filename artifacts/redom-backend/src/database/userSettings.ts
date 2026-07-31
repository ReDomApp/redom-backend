import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const userSettings = pgTable("user_settings", {
  // Internal Settings ID
  id: uuid("id").defaultRandom().primaryKey(),

  // Owner of these settings
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // ----------------------------
  // APPEARANCE
  // ----------------------------

  // Theme: system, light, dark
  theme: varchar("theme", {
    length: 20,
  })
    .default("system")
    .notNull(),

  // App language (system by default)
  language: varchar("language", {
    length: 20,
  })
    .default("system")
    .notNull(),

  // ----------------------------
  // FEED
  // ----------------------------

  // Show political content
  politicalContent: boolean("political_content")
    .default(true)
    .notNull(),

  // Show posts from people you follow
  followingFeed: boolean("following_feed")
    .default(true)
    .notNull(),

  // Snooze following feed
  // off, 1_day, 7_days, 14_days, 30_days
  followingFeedSnooze: varchar("following_feed_snooze", {
    length: 20,
  })
    .default("off")
    .notNull(),

  // Sensitive content
  // standard, less, more
  sensitiveContent: varchar("sensitive_content", {
    length: 20,
  })
    .default("standard")
    .notNull(),

  // ----------------------------
  // VIDEO
  // ----------------------------

  // Autoplay
  // off, wifi_only, wifi_mobile
  autoplayVideos: varchar("autoplay_videos", {
    length: 20,
  })
    .default("off")
    .notNull(),

  // ----------------------------
  // TRANSLATION
  // ----------------------------

  // Automatically translate posts
  autoTranslatePosts: boolean("auto_translate_posts")
    .default(true)
    .notNull(),

  // Automatically translate comments
  autoTranslateComments: boolean("auto_translate_comments")
    .default(true)
    .notNull(),

  // ----------------------------
  // ACCESSIBILITY
  // ----------------------------

  // small, medium, large, extra_large
  fontSize: varchar("font_size", {
    length: 20,
  })
    .default("medium")
    .notNull(),

  // Reduce animations
  reduceMotion: boolean("reduce_motion")
    .default(false)
    .notNull(),

  // High contrast mode
  highContrast: boolean("high_contrast")
    .default(false)
    .notNull(),

  // Screen reader mode
  screenReaderMode: boolean("screen_reader_mode")
    .default(false)
    .notNull(),

  // always, automatic, off
  captions: varchar("captions", {
    length: 20,
  })
    .default("automatic")
    .notNull(),

  // ----------------------------
  // PROFILE
  // ----------------------------

  // Show joined date
  showJoinDate: boolean("show_join_date")
    .default(true)
    .notNull(),

  // ----------------------------
  // SYSTEM
  // ----------------------------

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull(),
});