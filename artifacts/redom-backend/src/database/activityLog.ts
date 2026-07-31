import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const activityLog = pgTable("activity_log", {
  // Internal Activity ID
  id: uuid("id").defaultRandom().primaryKey(),

  // Owner of the activity
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // --------------------------------
  // ACTIVITY DETAILS
  // --------------------------------

  // login, like, follow, comment, watch_video...
  activityType: varchar("activity_type", {
    length: 100,
  }).notNull(),

  // account, feed, profile, friends,
  // messages, pages, groups,
  // marketplace, verification...
  activityCategory: varchar("activity_category", {
    length: 50,
  }).notNull(),

  // Display title
  activityTitle: varchar("activity_title", {
    length: 255,
  }).notNull(),

  // Display description
  activityDescription: varchar("activity_description", {
    length: 1000,
  }),

  // Icon displayed in Activity Log
  activityIcon: varchar("activity_icon", {
    length: 100,
  }),

  // --------------------------------
  // RELATED CONTENT
  // --------------------------------

  targetId: uuid("target_id"),

  // post, reel, story, comment,
  // profile, page, group...
  targetType: varchar("target_type", {
    length: 50,
  }),

  // Human readable target name
  targetTitle: varchar("target_title", {
    length: 255,
  }),

  // Thumbnail shown in activity list
  thumbnailUrl: varchar("thumbnail_url", {
    length: 1000,
  }),

  // Deep link
  targetUrl: varchar("target_url", {
    length: 1000,
  }),

  // --------------------------------
  // DEVICE
  // --------------------------------

  deviceName: varchar("device_name", {
    length: 150,
  }),

  // phone, tablet, desktop, laptop
  deviceType: varchar("device_type", {
    length: 20,
  }),

  // app, redom_lite, web
  source: varchar("source", {
    length: 20,
  }),

  // --------------------------------
  // LOCATION
  // --------------------------------

  country: varchar("country", {
    length: 100,
  }),

  region: varchar("region", {
    length: 100,
  }),

  city: varchar("city", {
    length: 100,
  }),

  // --------------------------------
  // STATUS
  // --------------------------------

  // success, failed, pending
  status: varchar("status", {
    length: 20,
  })
    .default("success")
    .notNull(),

  // user or system
  triggeredBy: varchar("triggered_by", {
    length: 20,
  })
    .default("user")
    .notNull(),

  // Can the action be undone?
  undoSupported: boolean("undo_supported")
    .default(false)
    .notNull(),

  // Hidden from user's Activity Log
  hidden: boolean("hidden")
    .default(false)
    .notNull(),

  // Archived by user
  archived: boolean("archived")
    .default(false)
    .notNull(),

  // --------------------------------
  // TIME
  // --------------------------------

  activityTime: timestamp("activity_time")
    .defaultNow()
    .notNull(),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull(),
});