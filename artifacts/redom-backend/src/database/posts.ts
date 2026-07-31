import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const posts = pgTable("posts", {

  // --------------------------------------------------
  // INTERNAL IDENTIFIER
  // --------------------------------------------------

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // Author
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // --------------------------------------------------
  // PUBLIC SHARE ID
  // --------------------------------------------------

  /**
   * Permanent public identifier.
   *
   * Example:
   *
   * ReDom/4K29A7XQ1M
   *
   * Exactly 10 characters.
   *
   * Used for:
   * • Sharing
   * • Deep links
   * • QR Codes
   * • Search
   */

  shareId: varchar("share_id", {
    length: 10,
  })
    .unique()
    .notNull(),

  // --------------------------------------------------
  // CONTENT
  // --------------------------------------------------

  content: text("content"),

  // --------------------------------------------------
  // POST TYPE
  // --------------------------------------------------

  /**
   * text
   * photo
   * video
   * reel
   * story
   * poll
   * shared
   * quote
   */

  type: varchar("type", {
    length: 20,
  })
    .default("text")
    .notNull(),

  // --------------------------------------------------
  // VISIBILITY
  // --------------------------------------------------

  /**
   * public
   * friends
   * followers
   * only_me
   */

  visibility: varchar("visibility", {
    length: 20,
  })
    .default("public")
    .notNull(),

  // --------------------------------------------------
  // SETTINGS
  // --------------------------------------------------

  commentsEnabled: boolean("comments_enabled")
    .default(true)
    .notNull(),

  sharingEnabled: boolean("sharing_enabled")
    .default(true)
    .notNull(),

  edited: boolean("edited")
    .default(false)
    .notNull(),

  deleted: boolean("deleted")
    .default(false)
    .notNull(),

  // --------------------------------------------------
  // TIMESTAMPS
  // --------------------------------------------------

  publishedAt: timestamp("published_at", {
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