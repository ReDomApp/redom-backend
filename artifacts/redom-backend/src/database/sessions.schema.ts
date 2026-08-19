import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const sessions = pgTable(
  "sessions",
  {
    // Internal authentication session ID
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    // Account that owns the session
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    // Hashed refresh token.
    // The plaintext refresh token must never be stored.
    refreshTokenHash: varchar(
      "refresh_token_hash",
      {
        length: 255,
      },
    ).notNull(),

    // Client/device information
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

    // Network/location information
    ipAddress: varchar("ip_address", {
      length: 45,
    }),

    country: varchar("country", {
      length: 100,
    }),

    // Authentication activity
    lastActivityAt: timestamp(
      "last_activity_at",
    )
      .defaultNow()
      .notNull(),

    // Absolute session expiration
    expiresAt: timestamp("expires_at")
      .notNull(),

    // Set when the session is revoked
    revokedAt: timestamp("revoked_at"),

    // Record creation time
    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),
  },
);