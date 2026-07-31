import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { postMedia } from "./postMedia";
import { userProfiles } from "./userProfiles";

export const videoComments = pgTable("video_comments", {

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
  // AUTHOR
  // ==================================================

  authorId: uuid("author_id")
    .notNull()
    .references(() => userProfiles.id),

  // ==================================================
  // REPLY
  // ==================================================

  parentCommentId: uuid("parent_comment_id"),

  // ==================================================
  // CONTENT
  // ==================================================

  comment: text("comment")
    .notNull(),

  edited: boolean("edited")
    .default(false)
    .notNull(),

  deleted: boolean("deleted")
    .default(false)
    .notNull(),

  // ==================================================
  // ENGAGEMENT
  // ==================================================

  likeCount: integer("like_count")
    .default(0)
    .notNull(),

  replyCount: integer("reply_count")
    .default(0)
    .notNull(),

  creatorHeart: boolean("creator_heart")
    .default(false)
    .notNull(),

  pinned: boolean("pinned")
    .default(false)
    .notNull(),

  // ==================================================
  // VISIBILITY
  // ==================================================

  visibility: varchar("visibility", {
    length: 30,
  })
    .default("public")
    .notNull(),

  /**
   * public
   * followers
   * friends
   * hidden
   */

  // ==================================================
  // MENTIONS
  // ==================================================

  hasMentions: boolean("has_mentions")
    .default(false)
    .notNull(),

  hasHashtags: boolean("has_hashtags")
    .default(false)
    .notNull(),

  // ==================================================
  // MODERATION
  // ==================================================

  moderationStatus: varchar("moderation_status", {
    length: 30,
  })
    .default("approved")
    .notNull(),

  /**
   * pending
   * approved
   * hidden
   * removed
   * rejected
   */

  spamDetected: boolean("spam_detected")
    .default(false)
    .notNull(),

  aiReviewed: boolean("ai_reviewed")
    .default(false)
    .notNull(),

  reported: boolean("reported")
    .default(false)
    .notNull(),

  reportCount: integer("report_count")
    .default(0)
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