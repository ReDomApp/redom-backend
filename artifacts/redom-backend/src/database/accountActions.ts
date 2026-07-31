import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";
import { reports } from "./reports";

export const accountActions = pgTable(
  "account_actions",
  {

    // ==================================================
    // INTERNAL ID
    // ==================================================

    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    // ==================================================
    // RELATIONSHIPS
    // ==================================================

    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id),

    moderatorId: uuid("moderator_id")
      .references(() => userProfiles.id),

    reportId: uuid("report_id")
      .references(() => reports.id),

    // ==================================================
    // ENFORCEMENT ACTION
    // ==================================================

    /**
     * warning
     * strike
     * content_removed
     * feature_restriction
     * account_restricted
     * temporary_suspension
     * permanent_suspension
     * permanent_ban
     * shadow_ban
     * appeal_reversal
     */
    actionType: varchar(
      "action_type",
      {
        length: 40,
      },
    ).notNull(),

    // ==================================================
    // REASON
    // ==================================================

    /**
     * spam
     * scam
     * fake_account
     * impersonation
     * harassment
     * hate_speech
     * violence
     * terrorism
     * child_safety
     * adult_nudity
     * graphic_content
     * copyright
     * trademark
     * misinformation
     * self_harm
     * illegal_goods
     * drugs
     * weapons
     * fraud
     * other
     */
    reason: varchar("reason", {
      length: 60,
    }).notNull(),

    description: text(
      "description",
    ),

    // ==================================================
    // STRIKES & WARNINGS
    // ==================================================

    strikeLevel: integer(
      "strike_level",
    )
      .default(0)
      .notNull(),

    warningCount: integer(
      "warning_count",
    )
      .default(0)
      .notNull(),

    // ==================================================
    // RESTRICTIONS
    // ==================================================

    permanent: boolean(
      "permanent",
    )
      .default(false)
      .notNull(),

    durationHours: integer(
      "duration_hours",
    ),

    // ==================================================
    // APPEALS
    // ==================================================

    appealed: boolean("appealed")
      .default(false)
      .notNull(),

    appealAccepted: boolean(
      "appeal_accepted",
    )
      .default(false)
      .notNull(),

    appealRejected: boolean(
      "appeal_rejected",
    )
      .default(false)
      .notNull(),

    // ==================================================
    // STATUS
    // ==================================================

    /**
     * active
     * expired
     * revoked
     */
    status: varchar("status", {
      length: 20,
    })
      .default("active")
      .notNull(),

    // ==================================================
    // SYSTEM
    // ==================================================

    createdAt: timestamp(
      "created_at",
      {
        withTimezone: true,
      },
    )
      .defaultNow()
      .notNull(),

    expiresAt: timestamp(
      "expires_at",
      {
        withTimezone: true,
      },
    ),

    revokedAt: timestamp(
      "revoked_at",
      {
        withTimezone: true,
      },
    ),

    updatedAt: timestamp(
      "updated_at",
      {
        withTimezone: true,
      },
    )
      .defaultNow()
      .notNull(),

  },
);