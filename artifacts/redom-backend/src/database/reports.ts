import {
  pgTable,
  uuid,
  varchar,
  text,
  real,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),

  reporterUserId: uuid("reporter_user_id")
    .notNull()
    .references(() => userProfiles.id),
  reportedUserId: uuid("reported_user_id").references(() => userProfiles.id),
  moderatorUserId: uuid("moderator_user_id").references(() => userProfiles.id),

  reportTarget: varchar("report_target", { length: 40 }).notNull(),
  targetId: uuid("target_id"),
  reportReason: varchar("report_reason", { length: 60 }).notNull(),
  additionalDetails: text("additional_details"),
  userComment: text("user_comment"),
  screenshotUrl: text("screenshot_url"),
  attachmentUrl: text("attachment_url"),
  aiEvidenceSummary: text("ai_evidence_summary"),

  aiReviewed: boolean("ai_reviewed").default(false).notNull(),
  aiConfidenceScore: real("ai_confidence_score"),
  aiRecommendedAction: varchar("ai_recommended_action", { length: 40 }),
  autoHidden: boolean("auto_hidden").default(false).notNull(),
  autoRemoved: boolean("auto_removed").default(false).notNull(),
  requiresHumanReview: boolean("requires_human_review").default(true).notNull(),

  moderatorAction: varchar("moderator_action", { length: 40 })
    .default("pending")
    .notNull(),
  moderatorNotes: text("moderator_notes"),

  appealSubmitted: boolean("appeal_submitted").default(false).notNull(),
  appealReviewed: boolean("appeal_reviewed").default(false).notNull(),
  appealAccepted: boolean("appeal_accepted").default(false).notNull(),
  appealRejected: boolean("appeal_rejected").default(false).notNull(),

  status: varchar("status", { length: 30 }).default("open").notNull(),
  priority: varchar("priority", { length: 20 }).default("normal").notNull(),

  reportSource: varchar("report_source", { length: 40 }).default("general").notNull(),
  exitAfterReport: boolean("exit_after_report").default(false).notNull(),
  evidenceMessageCount: real("evidence_message_count").default(0).notNull(),
  aiModel: varchar("ai_model", { length: 100 }),
  aiCategories: jsonb("ai_categories"),
  aiCategoryScores: jsonb("ai_category_scores"),
  aiDecision: varchar("ai_decision", { length: 50 }),
  aiReviewedAt: timestamp("ai_reviewed_at", { withTimezone: true }),
  emailNotificationSentAt: timestamp("email_notification_sent_at", { withTimezone: true }),
  emailNotificationError: text("email_notification_error"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});
