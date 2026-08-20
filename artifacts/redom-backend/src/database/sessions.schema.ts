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
    // --------------------------------
    // PRIMARY IDENTITY
    // --------------------------------

    // Server-generated authentication session UUID.
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    // Account that owns this session.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    // --------------------------------
    // AUTHENTICATION CREDENTIAL
    // --------------------------------

    // Only the hashed refresh token is stored.
    refreshTokenHash: varchar(
      "refresh_token_hash",
      {
        length: 255,
      },
    ).notNull(),

    // --------------------------------
    // DEVICE
    // --------------------------------

    deviceId: varchar(
      "device_id",
      {
        length: 255,
      },
    ),

    deviceName: varchar(
      "device_name",
      {
        length: 255,
      },
    ),

    platform: varchar(
      "platform",
      {
        length: 100,
      },
    ),

    browser: varchar(
      "browser",
      {
        length: 100,
      },
    ),

    userAgent: varchar(
      "user_agent",
      {
        length: 500,
      },
    ),

    // --------------------------------
    // NETWORK / LOCATION
    // --------------------------------

    ipAddress: varchar(
      "ip_address",
      {
        length: 45,
      },
    ),

    country: varchar(
      "country",
      {
        length: 100,
      },
    ),

    region: varchar(
      "region",
      {
        length: 100,
      },
    ),

    city: varchar(
      "city",
      {
        length: 100,
      },
    ),

    // --------------------------------
    // SESSION LIFECYCLE
    // --------------------------------

    lastActivityAt: timestamp(
      "last_activity_at",
    )
      .defaultNow()
      .notNull(),

    expiresAt: timestamp(
      "expires_at",
    ).notNull(),

    revokedAt: timestamp(
      "revoked_at",
    ),

    // --------------------------------
    // SYSTEM
    // --------------------------------

    createdAt: timestamp(
      "created_at",
    )
      .defaultNow()
      .notNull(),

    updatedAt: timestamp(
      "updated_at",
    )
      .defaultNow()
      .notNull(),
  },
);