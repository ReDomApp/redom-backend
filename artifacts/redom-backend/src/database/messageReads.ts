import {
  pgTable,
  uuid,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { messages } from "./messages";
import { userProfiles } from "./userProfiles";

export const messageReads = pgTable("message_reads", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // RELATIONSHIPS
  // ==================================================

  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id),

  readerId: uuid("reader_id")
    .notNull()
    .references(() => userProfiles.id),

  // ==================================================
  // DELIVERY STATUS
  // ==================================================

  /**
   * ✓ Sent
   */
  sent: boolean("sent")
    .default(true)
    .notNull(),

  /**
   * ✓✓ Delivered
   */
  delivered: boolean("delivered")
    .default(false)
    .notNull(),

  deliveredAt: timestamp("delivered_at", {
    withTimezone: true,
  }),

  /**
   * ✓✓ Read (Green)
   */
  read: boolean("read")
    .default(false)
    .notNull(),

  readAt: timestamp("read_at", {
    withTimezone: true,
  }),

  // ==================================================
  // READ RECEIPTS
  // ==================================================

  /**
   * Conversation-specific setting.
   * Default ON.
   */
  readReceiptEnabled: boolean(
    "read_receipt_enabled",
  )
    .default(true)
    .notNull(),

  /**
   * True when read receipts are hidden
   * for this conversation.
   */
  readHidden: boolean("read_hidden")
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