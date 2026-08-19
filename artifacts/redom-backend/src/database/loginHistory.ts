import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";
import { sessions } from "./sessions.schema";

export const loginHistory = pgTable(
  "login_history",
  {
    // Internal Login Record ID
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    // User who logged in
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    // Authentication session represented
    // by this historical record
    sessionId: uuid("session_id")
      .notNull()
      .unique()
      .references(() => sessions.id, {
        onDelete: "cascade",
      }),

    // ----------------------------
    // DEVICE INFORMATION
    // ----------------------------

    deviceName: varchar(
      "device_name",
      {
        length: 150,
      },
    ).notNull(),

    deviceType: varchar(
      "device_type",
      {
        length: 20,
      },
    ).notNull(),

    loginSource: varchar(
      "login_source",
      {
        length: 20,
      },
    ).notNull(),

    appVersion: varchar(
      "app_version",
      {
        length: 30,
      },
    ),

    // ----------------------------
    // LOCATION
    // ----------------------------

    ipAddress: varchar(
      "ip_address",
      {
        length: 45,
      },
    ).notNull(),

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

    // ----------------------------
    // SESSION HISTORY
    // ----------------------------

    loginTime: timestamp(
      "login_time",
    )
      .defaultNow()
      .notNull(),

    logoutTime: timestamp(
      "logout_time",
    ),

    active: boolean("active")
      .default(true)
      .notNull(),

    // active | ended | revoked | expired
    sessionStatus: varchar(
      "session_status",
      {
        length: 30,
      },
    )
      .default("active")
      .notNull(),

    // ----------------------------
    // USER VIEW
    // ----------------------------

    hiddenByUser: boolean(
      "hidden_by_user",
    )
      .default(false)
      .notNull(),

    // ----------------------------
    // SYSTEM
    // ----------------------------

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