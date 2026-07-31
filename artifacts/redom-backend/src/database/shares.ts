import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";

export const shares = pgTable("shares", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // USER SHARING CONTENT
  // ==================================================

  sharerId: uuid("sharer_id")
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
   * page_post
   */

  contentType: varchar("content_type", {
    length: 30,
  }).notNull(),

  /**
   * Internal UUID
   * of the content.
   */

  contentId: uuid("content_id")
    .notNull(),

  /**
   * Permanent public
   * ReDom share ID.
   *
   * Example:
   * Ab93KD7LpQ
   */

  shareId: varchar("share_id", {
    length: 10,
  }).notNull(),

  // ==================================================
  // SHARE DESTINATION
  // ==================================================

  /**
   * profile
   * feed
   * friend_timeline
   * message
   * copy_link
   * external
   */

  destination: varchar("destination", {
    length: 30,
  }).notNull(),

  /**
   * Used only when
   * destination = external
   *
   * whatsapp
   * facebook
   * messenger
   * telegram
   * x
   * email
   * sms
   * native_share
   * other
   */

  externalPlatform: varchar("external_platform", {
    length: 50,
  }),

  // ==================================================
  // STATUS
  // ==================================================

  validShare: boolean("valid_share")
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