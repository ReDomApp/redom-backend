import {
  pgTable,
  uuid,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const following = pgTable("following", {
  // Internal Following Record ID
  id: uuid("id").defaultRandom().primaryKey(),

  // User who is following someone
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // Account being followed
  followingId: uuid("following_id")
    .notNull()
    .references(() => users.id),

  // Date following started
  followingAt: timestamp("following_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  // Record created
  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  // Record updated
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});