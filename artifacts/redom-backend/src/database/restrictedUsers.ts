import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const restrictedUsers = pgTable("restricted_users", {
  // Internal Restriction Record ID
  id: uuid("id").defaultRandom().primaryKey(),

  // User applying restriction
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // User being restricted
  restrictedUserId: uuid("restricted_user_id")
    .notNull()
    .references(() => users.id),

  // Optional reason
  //
  // spam
  // harassment
  // unwanted_messages
  // inappropriate_content
  // privacy
  // other
  reason: varchar("reason", {
    length: 50,
  }),

  // ----------------------------
  // RESTRICTION TYPE
  // ----------------------------

  // standard | heavy
  restrictionType: varchar("restriction_type", {
    length: 20,
  })
    .default("standard")
    .notNull(),

  // ----------------------------
  // RESTRICTION DURATION
  // ----------------------------

  // 24_hours
  // 7_days
  // 14_days
  // 1_month
  // custom
  duration: varchar("duration", {
    length: 20,
  })
    .default("24_hours")
    .notNull(),

  // Used only when
  // duration = custom
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
  }),

  // Date restricted
  restrictedAt: timestamp("restricted_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  // Restriction removed
  isActive: boolean("is_active")
    .default(true)
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