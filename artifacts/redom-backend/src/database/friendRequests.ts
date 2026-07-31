import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const friendRequests = pgTable("friend_requests", {
  // Internal Friend Request ID
  id: uuid("id").defaultRandom().primaryKey(),

  // Person sending the request
  senderId: uuid("sender_id")
    .notNull()
    .references(() => users.id),

  // Person receiving the request
  receiverId: uuid("receiver_id")
    .notNull()
    .references(() => users.id),

  // Request Status
  // pending | accepted | declined | cancelled | expired
  status: varchar("status", {
    length: 20,
  })
    .default("pending")
    .notNull(),

  // Restriction Status
  // none | warning | local_region_only | temporary_disabled |
  // long_term_disabled | under_moderation
  restrictionLevel: varchar("restriction_level", {
    length: 30,
  })
    .default("none")
    .notNull(),

  // Whether moderation is required
  requiresModeration: boolean("requires_moderation")
    .default(false)
    .notNull(),

  // Whether the request was automatically restricted
  autoRestricted: boolean("auto_restricted")
    .default(false)
    .notNull(),

  // Request expiration date
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
  }),

  // Accepted date
  acceptedAt: timestamp("accepted_at", {
    withTimezone: true,
  }),

  // Declined date
  declinedAt: timestamp("declined_at", {
    withTimezone: true,
  }),

  // Cancelled date
  cancelledAt: timestamp("cancelled_at", {
    withTimezone: true,
  }),

  // Expired date
  expiredAt: timestamp("expired_at", {
    withTimezone: true,
  }),

  // Number of moderation actions taken
  moderationCount: integer("moderation_count")
    .default(0)
    .notNull(),

  // Record timestamps
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