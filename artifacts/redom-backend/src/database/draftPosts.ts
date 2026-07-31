import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";
import { polls } from "./polls";

export const draftPosts = pgTable("draft_posts", {

  // ==================================================
  // INTERNAL REDOM DRAFT ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // CREATOR
  // ==================================================

  creatorId: uuid("creator_id")
    .notNull()
    .references(() => userProfiles.id),

  // ==================================================
  // DRAFT CONTENT
  // ==================================================

  title: varchar("title", {
    length: 150,
  }),

  caption: text("caption"),

  privacy: varchar("privacy", {
    length: 30,
  })
    .default("friends")
    .notNull(),

  // ==================================================
  // ATTACHMENTS
  // ==================================================

  photos: jsonb("photos"),

  videos: jsonb("videos"),

  gifs: jsonb("gifs"),

  pollId: uuid("poll_id")
    .references(() => polls.id),

  location: jsonb("location"),

  feeling: varchar("feeling", {
    length: 100,
  }),

  activity: varchar("activity", {
    length: 100,
  }),

  mentions: jsonb("mentions"),

  taggedUsers: jsonb("tagged_users"),

  // ==================================================
  // SAVE STATUS
  // ==================================================

  autoSaved: boolean("auto_saved")
    .default(true)
    .notNull(),

  manuallySaved: boolean("manually_saved")
    .default(false)
    .notNull(),

  readyToPublish: boolean("ready_to_publish")
    .default(false)
    .notNull(),

  hasUnsavedChanges: boolean("has_unsaved_changes")
    .default(false)
    .notNull(),

  movedToScheduledPosts: boolean("moved_to_scheduled_posts")
    .default(false)
    .notNull(),

  // ==================================================
  // MODERATION
  // ==================================================

  aiReviewed: boolean("ai_reviewed")
    .default(false)
    .notNull(),

  moderationStatus: varchar("moderation_status", {
    length: 30,
  })
    .default("pending")
    .notNull(),

  mediaScanned: boolean("media_scanned")
    .default(false)
    .notNull(),

  // ==================================================
  // TRASH
  // ==================================================

  trashed: boolean("trashed")
    .default(false)
    .notNull(),

  trashedAt: timestamp("trashed_at", {
    withTimezone: true,
  }),

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