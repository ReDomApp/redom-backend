import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";

export const reactions = pgTable("reactions", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // REACTOR
  // ==================================================

  reactorId: uuid("reactor_id")
    .notNull()
    .references(() => userProfiles.id),

  // ==================================================
  // CONTENT
  // ==================================================

  /**
   * post
   * video
   * photo
   * reel
   * story
   * comment
   * livestream
   * page_post
   */

  contentType: varchar("content_type", {
    length: 30,
  }).notNull(),

  /**
   * ID of the content
   * being reacted to.
   */

  contentId: uuid("content_id")
    .notNull(),

  // ==================================================
  // REACTION
  // ==================================================

  /**
   * like
   * love
   * haha
   * wow
   * sad
   * angry
   * heart
   */

  reactionType: varchar("reaction_type", {
    length: 20,
  })
    .default("like")
    .notNull(),

  /**
   * Only Story supports:
   * heart
   *
   * Story does not support:
   * like
   * love
   * haha
   * wow
   * sad
   * angry
   *
   * Heart immediately sends
   * to the story owner.
   *
   * Selecting another emoji
   * from the Story reaction
   * tray sends that emoji
   * directly into Messages,
   * not as a Story reaction.
   */

  // ==================================================
  // STATUS
  // ==================================================

  active: boolean("active")
    .default(true)
    .notNull(),

  spamDetected: boolean("spam_detected")
    .default(false)
    .notNull(),

  aiReviewed: boolean("ai_reviewed")
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