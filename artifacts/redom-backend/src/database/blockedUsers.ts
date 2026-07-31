import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const blockedUsers = pgTable("blocked_users", {
  // Internal Block Record ID
  id: uuid("id").defaultRandom().primaryKey(),

  // User performing the block
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // User being blocked
  blockedUserId: uuid("blocked_user_id")
    .notNull()
    .references(() => users.id),

  // Reason selected by the blocker
  //
  // spam
  // harassment
  // fake_account
  // inappropriate_content
  // privacy
  // other
  reason: varchar("reason", {
    length: 50,
  }),

  // Date blocked
  blockedAt: timestamp("blocked_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  // System timestamps
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