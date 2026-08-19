import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { users } from "./schema";
import { sessions } from "./sessions.schema";

export const activeSessions = pgTable(
  "active_sessions",
  {
    // Internal active-session record ID
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    // Account that owns this active session
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    // Authentication session represented by this record
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, {
        onDelete: "cascade",
      }),

    // --------------------------------
    // DEVICE INFORMATION
    // --------------------------------

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

    // --------------------------------
    // LOCATION / NETWORK
    // --------------------------------

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

    // --------------------------------
    // SESSION ACTIVITY
    // --------------------------------

    loginTime: timestamp("login_time")
      .defaultNow()
      .notNull(),

    lastActivity: timestamp(
      "last_activity",
    )
      .defaultNow()
      .notNull(),

    // --------------------------------
    // SYSTEM
    // --------------------------------

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // One current-session record per authentication session
    sessionIdUnique: unique(
      "active_sessions_session_id_unique",
    ).on(table.sessionId),
  }),
);