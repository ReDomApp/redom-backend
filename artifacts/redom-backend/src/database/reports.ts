import {
  pgTable,
  uuid,
  varchar,
  text,
  real,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";

export const reports = pgTable("reports", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // RELATIONSHIPS
  // ==================================================

  reporterUserId: uuid("reporter_user_id")
    .notNull()
    .references(() => userProfiles.id),

  reportedUserId: uuid("reported_user_id")
    .references(() => userProfiles.id),

  moderatorUserId: uuid("moderator_user_id")
    .references(() => userProfiles.id),

  // ==================================================
  // REPORT TARGET
  // ==================================================

  /**
   * profile
   * post
   * comment
   * story
   * video
   * message
   * conversation
   * marketplace
   * group
   * page
   * other
   */
  reportTarget: varchar("report_target", {
    length: 40,
  }).notNull(),

  /**
   * UUID of the reported item.
   */
  targetId: uuid("target_id"),

  // ==================================================
  // REPORT REASON
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
  reportReason: varchar("report_reason", {
    length: 60,
  }).notNull(),

  additionalDetails: text(
    "additional_details",
  ),

  // ==================================================
  // EVIDENCE
  // ==================================================

  userComment: text("user_comment"),

  screenshotUrl: text(
    "screenshot_url",
  ),

  attachmentUrl: text(
    "attachment_url",
  ),

  aiEvidenceSummary: text(
    "ai_evidence_summary",
  ),

  // ==================================================
  // AI MODERATION
  // ==================================================

  aiReviewed: boolean("ai_reviewed")
    .default(false)
    .notNull(),

  aiConfidenceScore: real(
    "ai_confidence_score",
  ),

  /**
   * approve
   * warn
   * restrict
   * remove_content
   * suspend
   * ban
   * escalate
   */
  aiRecommendedAction: varchar(
    "ai_recommended_action",
    {
      length: 40,
    },
  ),

  autoHidden: boolean("auto_hidden")
    .default(false)
    .notNull(),

  autoRemoved: boolean("auto_removed")
    .default(false)
    .notNull(),

  requiresHumanReview: boolean(
    "requires_human_review",
  )
    .default(true)
    .notNull(),

  // ==================================================
  // MODERATOR ACTION
  // ==================================================

  /**
   * pending
   * under_review
   * no_violation
   * warning_issued
   * content_removed
   * account_restricted
   * account_suspended
   * account_banned
   * escalated
   */
  moderatorAction: varchar(
    "moderator_action",
    {
      length: 40,
    },
  )
    .default("pending")
    .notNull(),

  moderatorNotes: text(
    "moderator_notes",
  ),

  // ==================================================
  // APPEALS
  // ==================================================

  appealSubmitted: boolean(
    "appeal_submitted",
  )
    .default(false)
    .notNull(),

  appealReviewed: boolean(
    "appeal_reviewed",
  )
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
   * open
   * closed
   * deleted
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