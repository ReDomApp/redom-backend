import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const friends = pgTable("friends", {
  // Internal Friendship Record ID
  id: uuid("id").defaultRandom().primaryKey(),

  // Account Owner
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // Friend
  friendUserId: uuid("friend_user_id")
    .notNull()
    .references(() => users.id),

  // ----------------------------
  // FRIENDSHIP
  // ----------------------------

  // active, removed
  friendshipStatus: varchar("friendship_status", {
    length: 20,
  })
    .default("active")
    .notNull(),

  // Date both users officially became friends
  friendsSince: timestamp("friends_since", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  // ----------------------------
  // RECORD HISTORY
  // ----------------------------

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