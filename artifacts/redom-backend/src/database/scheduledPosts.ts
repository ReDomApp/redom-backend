import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  bigint,
  timestamp,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";
import { polls } from "./polls";

export const scheduledPosts = pgTable("scheduled_posts", {

  // ==================================================
  // INTERNAL REDOM SCHEDULE ID
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
  // POST CONTENT
  // ==================================================

  title: varchar("title", {
    length: 150,
  }),

  caption: text("caption"),

  /**
   * Privacy
   *
   * Normal Profile
   * Default:
   * • Friends
   *
   * Professional Mode
   * Default:
   * • Public
   *
   * Page
   * Default:
   * • Public
   *
   * Supported:
   * • only_me
   * • friends
   * • public
   *
   * Friends privacy
   * applies only to:
   * • Normal Profile
   * • Professional Mode
   *
   * Pages support:
   * • only_me
   * • public
   */
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
  // SCHEDULING
  // ==================================================

  /**
   * Maximum scheduling:
   * 30 days.
   */
  scheduledFor: timestamp("scheduled_for", {
    withTimezone: true,
  }).notNull(),

  /**
   * User grants ReDom
   * permission to securely
   * retain the finalized
   * scheduled post package
   * so it can publish
   * automatically even
   * when the creator
   * is offline.
   */
  publishPermissionGranted: boolean("publish_permission_granted")
    .default(false)
    .notNull(),

  /**
   * Indicates the entire
   * scheduled post package
   * has been uploaded
   * successfully.
   */
  uploadCompleted: boolean("upload_completed")
    .default(false)
    .notNull(),

  /**
   * Size of the uploaded
   * scheduled post package
   * in bytes.
   */
  uploadSizeBytes: bigint("upload_size_bytes", {
    mode: "number",
  })
    .default(0)
    .notNull(),

  /**
   * Upload completed time.
   */
  uploadedAt: timestamp("uploaded_at", {
    withTimezone: true,
  }),

  /**
   * Published automatically
   * by ReDom.
   */
  published: boolean("published")
    .default(false)
    .notNull(),

  /**
   * Time of publication.
   */
  publishedAt: timestamp("published_at", {
    withTimezone: true,
  }),

  /**
   * Creator cancelled the
   * scheduled publication.
   */
  cancelled: boolean("cancelled")
    .default(false)
    .notNull(),

  // ==================================================
  // MODERATION
  // ==================================================

  /**
   * AI moderation completed.
   */
  aiReviewed: boolean("ai_reviewed")
    .default(false)
    .notNull(),

  /**
   * pending
   * approved
   * rejected
   */
  moderationStatus: varchar("moderation_status", {
    length: 30,
  })
    .default("pending")
    .notNull(),

  /**
   * Media security scan.
   */
  mediaScanned: boolean("media_scanned")
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