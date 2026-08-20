import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";

import { users } from "./schema";
import { sessions } from "./sessions.schema";

export const activeSessions =
  pgTable(
    "active_sessions",
    {
      // --------------------------------
      // INTERNAL ID
      // --------------------------------

      id: uuid("id")
        .defaultRandom()
        .primaryKey(),

      // --------------------------------
      // ACCOUNT
      // --------------------------------

      userId: uuid("user_id")
        .notNull()
        .references(
          () => users.id,
          {
            onDelete:
              "cascade",
          },
        ),

      // --------------------------------
      // AUTHENTICATION SESSION
      // --------------------------------

      // This is the authoritative
      // sessions.id being represented.
      sessionId: uuid(
        "session_id",
      )
        .notNull()
        .references(
          () => sessions.id,
          {
            onDelete:
              "cascade",
          },
        ),

      // --------------------------------
      // DEVICE
      // --------------------------------

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

      // --------------------------------
      // NETWORK / LOCATION
      // --------------------------------

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

      // --------------------------------
      // ACTIVITY
      // --------------------------------

      loginTime: timestamp(
        "login_time",
      )
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

    (table) => ({
      sessionIdUnique:
        unique(
          "active_sessions_session_id_unique",
        ).on(
          table.sessionId,
        ),

      userIdIndex:
        index(
          "active_sessions_user_id_idx",
        ).on(
          table.userId,
        ),

      lastActivityIndex:
        index(
          "active_sessions_last_activity_idx",
        ).on(
          table.lastActivity,
        ),
    }),
  );