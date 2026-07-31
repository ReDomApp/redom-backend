import {
  pgTable,
  uuid,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const followers = pgTable("followers", {
  // Internal Follow Record ID
  id: uuid("id").defaultRandom().primaryKey(),

  // User being followed
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // User who follows
  followerId: uuid("follower_id")
    .notNull()
    .references(() => users.id),

  // Date follow relationship started
  followedAt: timestamp("followed_at", {
    withTimezone: true,
  })
    .defaultNow()
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