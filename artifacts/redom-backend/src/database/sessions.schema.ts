import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

export const sessions = pgTable("sessions", {
  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  userId: uuid("user_id")
    .notNull(),

  refreshTokenHash: varchar(
    "refresh_token_hash",
    {
      length: 255,
    },
  ).notNull(),

  deviceId: varchar("device_id", {
    length: 255,
  }),

  deviceName: varchar("device_name", {
    length: 255,
  }),

  platform: varchar("platform", {
    length: 100,
  }),

  browser: varchar("browser", {
    length: 100,
  }),

  userAgent: varchar("user_agent", {
    length: 500,
  }),

  ipAddress: varchar("ip_address", {
    length: 45,
  }),

  country: varchar("country", {
    length: 100,
  }),

  lastActivityAt: timestamp(
    "last_activity_at",
  )
    .defaultNow()
    .notNull(),

  expiresAt: timestamp("expires_at")
    .notNull(),

  revokedAt: timestamp("revoked_at"),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),
});