import {
  pgTable,
  uuid,
  varchar,
  integer,
  decimal,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { postMedia } from "./postMedia";
import { userProfiles } from "./userProfiles";

export const videoViews = pgTable("video_views", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // VIDEO
  // ==================================================

  mediaId: uuid("media_id")
    .notNull()
    .references(() => postMedia.id),

  // ==================================================
  // VIEWER
  // ==================================================

  viewerId: uuid("viewer_id")
    .references(() => userProfiles.id),

  // ==================================================
  // VIEW SESSION
  // ==================================================

  sessionId: uuid("session_id"),

  startedAt: timestamp("started_at", {
    withTimezone: true,
  }).defaultNow(),

  endedAt: timestamp("ended_at", {
    withTimezone: true,
  }),

  // ==================================================
  // WATCHING
  // ==================================================

  watchDurationSeconds: integer("watch_duration_seconds")
    .default(0)
    .notNull(),

  completionPercentage: decimal("completion_percentage", {
    precision: 5,
    scale: 2,
  })
    .default("0.00")
    .notNull(),

  resumePositionSeconds: integer("resume_position_seconds")
    .default(0)
    .notNull(),

  qualifiedView: boolean("qualified_view")
    .default(false)
    .notNull(),

  repeatView: boolean("repeat_view")
    .default(false)
    .notNull(),

  // ==================================================
  // PLAYBACK
  // ==================================================

  selectedQuality: varchar("selected_quality", {
    length: 20,
  }).default("720p"),

  qualitySelectionMode: varchar("quality_selection_mode", {
    length: 20,
  }).default("automatic"),

  playbackSpeed: varchar("playback_speed", {
    length: 10,
  }).default("1x"),

  captionsEnabled: boolean("captions_enabled")
    .default(false)
    .notNull(),

  subtitleLanguage: varchar("subtitle_language", {
    length: 50,
  }),

  // ==================================================
  // DEVICE
  // ==================================================

  deviceType: varchar("device_type", {
    length: 30,
  }),

  operatingSystem: varchar("operating_system", {
    length: 50,
  }),

  appVersion: varchar("app_version", {
    length: 30,
  }),

  // ==================================================
  // NETWORK
  // ==================================================

  networkType: varchar("network_type", {
    length: 30,
  }),

  // ==================================================
  // LOCATION
  // ==================================================

  country: varchar("country", {
    length: 100,
  }),

  region: varchar("region", {
    length: 100,
  }),

  language: varchar("language", {
    length: 50,
  }),

  // ==================================================
  // RECOMMENDATION
  // ==================================================

  retentionScore: integer("retention_score"),

  recommendationWeight: integer("recommendation_weight"),

  // ==================================================
  // FRAUD DETECTION
  // ==================================================

  suspiciousView: boolean("suspicious_view")
    .default(false)
    .notNull(),

  invalidView: boolean("invalid_view")
    .default(false)
    .notNull(),

  // ==================================================
  // VIDEO SUBSCRIPTION
  // ==================================================

  /**
   * Applies only to videos
   * 8 minutes or longer.
   */

  subscriberOnlyVideo: boolean("subscriber_only_video")
    .default(false)
    .notNull(),

  subscriptionUnlocked: boolean("subscription_unlocked")
    .default(false)
    .notNull(),

  // ==================================================
  // SYSTEM
  // ==================================================

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