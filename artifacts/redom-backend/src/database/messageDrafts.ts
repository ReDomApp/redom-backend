import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { conversations } from "./conversations";
import { userProfiles } from "./userProfiles";

export const messageDrafts = pgTable("message_drafts", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // RELATIONSHIPS
  // ==================================================

  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),

  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id),

  // ==================================================
  // DRAFT CONTENT
  // ==================================================

  /**
   * Current unsent message.
   */
  draftMessage: text("draft_message"),

  /**
   * Indicates whether
   * a draft currently exists.
   */
  hasDraft: boolean("has_draft")
    .default(false)
    .notNull(),

  // ==================================================
  // STATUS
  // ==================================================

  /**
   * True once the draft
   * has been sent.
   */
  sent: boolean("sent")
    .default(false)
    .notNull(),

  /**
   * True if the user
   * manually discarded
   * the draft.
   */
  discarded: boolean("discarded")
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