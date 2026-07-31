import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const activeSessions = pgTable("active_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  sessionId: varchar("session_id", {
    length: 255,
  }).notNull(),

  deviceName: varchar("device_name", {
    length: 150,
  }).notNull(),

  deviceType: varchar("device_type", {
    length: 20,
  }).notNull(),

  loginSource: varchar("login_source", {
    length: 20,
  }).notNull(),

  appVersion: varchar("app_version", {
    length: 30,
  }),

  ipAddress: varchar("ip_address", {
    length: 45,
  }).notNull(),

  country: varchar("country", {
    length: 100,
  }),

  region: varchar("region", {
    length: 100,
  }),

  city: varchar("city", {
    length: 100,
  }),

  loginTime: timestamp("login_time")
    .defaultNow()
    .notNull(),

  lastActivity: timestamp("last_activity")
    .defaultNow()
    .notNull(),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull(),
});