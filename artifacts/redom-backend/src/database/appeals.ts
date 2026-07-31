import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";
import { accountActions } from "./accountActions";
import { reports } from "./reports";

export const appeals = pgTable("appeals", {

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

  accountActionId: uuid("account_action_id")
    .notNull()
    .references(() => accountActions.id),

  reportId: uuid("report_id")
    .references(() => reports.id),

  reviewedByModeratorId: uuid(
    "reviewed_by_moderator_id",
  ).references(() => userProfiles.id),

  // ==================================================
  // APPEAL TYPE
  // ==================================================

  /**
   * account_suspension
   * content_removal
   * warning
   * strike
   * feature_restriction
   * account_restriction
   * other
   */
  appealType: varchar("appeal_type", {
    length: 40,
  }).notNull(),

  // ==================================================
  // IDENTITY & SECURITY
  // ==================================================

  emailVerified: boolean("email_verified")
    .default(false)
    .notNull(),

  phoneVerified: boolean("phone_verified")
    .default(false)
    .notNull(),

  recaptchaPassed: boolean("recaptcha_passed")
    .default(false)
    .notNull(),

  identityVerified: boolean("identity_verified")
    .default(false)
    .notNull(),

  liveCheckPassed: boolean("live_check_passed")
    .default(false)
    .notNull(),

  /**
   * passport
   * national_id
   * visa_permit
   * drivers_license
   */
  identityDocumentType: varchar(
    "identity_document_type",
    {
      length: 30,
    },
  ),

  identityDocumentUrl: text(
    "identity_document_url",
  ),

  liveCheckUrl: text(
    "live_check_url",
  ),

  // ==================================================
  // ATTEMPTS
  // ==================================================

  appealAttempt: varchar(
    "appeal_attempt",
    {
      length: 10,
    },
  )
    .default("first")
    .notNull(),

  finalDecisionReached: boolean(
    "final_decision_reached",
  )
    .default(false)
    .notNull(),

  // ==================================================
  // APPEAL STATUS
  // ==================================================

  /**
   * submitted
   * under_review
   * approved
   * rejected
   * escalated
   */
  appealStatus: varchar(
    "appeal_status",
    {
      length: 30,
    },
  )
    .default("submitted")
    .notNull(),

  // ==================================================
  // USER SUBMISSION
  // ==================================================

  appealReason: varchar(
    "appeal_reason",
    {
      length: 150,
    },
  ),

  additionalExplanation: text(
    "additional_explanation",
  ),

  evidenceUrl: text("evidence_url"),

  attachmentUrl: text(
    "attachment_url",
  ),

  // ==================================================
  // MODERATOR REVIEW
  // ==================================================

  reviewNotes: text("review_notes"),

  decisionReason: text(
    "decision_reason",
  ),

  internalNotes: text(
    "internal_notes",
  ),

  // ==================================================
  // DECISION
  // ==================================================

  /**
   * restore_account
   * remove_warning
   * remove_strike
   * restore_content
   * reduce_suspension
   * keep_original_action
   * permanently_reject
   */
  decision: varchar("decision", {
    length: 40,
  }),

  // ==================================================
  // STATUS
  // ==================================================

  /**
   * open
   * closed
   * withdrawn
   */
  status: varchar("status", {
    length: 20,
  })
    .default("open")
    .notNull(),

  /**
   * low
   * normal
   * high
   * critical
   */
  priority: varchar("priority", {
    length: 20,
  })
    .default("normal")
    .notNull(),

  // ==================================================
  // SYSTEM
  // ==================================================

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

  reviewedAt: timestamp("reviewed_at", {
    withTimezone: true,
  }),

  closedAt: timestamp("closed_at", {
    withTimezone: true,
  }),

});