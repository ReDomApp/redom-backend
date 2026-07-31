import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const verification = pgTable("verification", {
  // Internal Verification Record ID
  id: uuid("id").defaultRandom().primaryKey(),

  // Account Owner
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),

  // -------------------------------
  // VERIFICATION STATUS
  // -------------------------------

  verificationStatus: varchar("verification_status", {
    length: 30,
  })
    .default("not_invited")
    .notNull(),

  // not_invited
  // invited
  // pending
  // approved
  // rejected
  // suspended
  // revoked

  // -------------------------------
  // VERIFICATION CATEGORY
  // -------------------------------

  verificationType: varchar("verification_type", {
    length: 20,
  }).notNull(),

  // individual
  // business
  // government
  // corporate
  // -------------------------------
  // REVIEW PROCESS
  // -------------------------------

  invitedAt: timestamp("invited_at"),

  applicationSubmittedAt: timestamp(
    "application_submitted_at"
  ),

  reviewStartedAt: timestamp("review_started_at"),

  approvedAt: timestamp("approved_at"),

  rejectedAt: timestamp("rejected_at"),

  revokedAt: timestamp("revoked_at"),

  suspendedAt: timestamp("suspended_at"),

  expiresAt: timestamp("expires_at"),

  // -------------------------------
  // REVIEW INFORMATION
  // -------------------------------

  rejectionReason: varchar("rejection_reason", {
    length: 1000,
  }),

  revocationReason: varchar("revocation_reason", {
    length: 1000,
  }),

  suspensionReason: varchar("suspension_reason", {
    length: 1000,
  }),

  reviewNotes: varchar("review_notes", {
    length: 3000,
  }),

  // -------------------------------
  // REVIEW PROVIDER
  // -------------------------------

  reviewedBy: varchar("reviewed_by", {
    length: 50,
  }),

  // persona
  // veriff
  // moderator

  // -------------------------------
  // USER EXPERIENCE
  // -------------------------------

  badgeVisible: boolean("badge_visible")
    .default(false)
    .notNull(),

  canReapply: boolean("can_reapply")
    .default(true)
    .notNull(),

  reviewTimeHours: varchar("review_time_hours", {
    length: 10,
  }).default("24"),

  applicationAttempts: varchar("application_attempts", {
    length: 10,
  }).default("0"),

  // -------------------------------
  // RECORD
  // -------------------------------

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull(),
});