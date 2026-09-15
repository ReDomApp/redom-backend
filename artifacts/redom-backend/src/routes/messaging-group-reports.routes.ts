import { Router } from "express";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { db, pool } from "../database/db";
import { conversations } from "../database/conversations";
import { conversationParticipants } from "../database/conversationParticipants";
import { messages } from "../database/messages";
import { reports } from "../database/reports";
import { reportEvidenceMessages } from "../database/reportEvidenceMessages";
import { userProfiles } from "../database/userProfiles";
import { moderateGroupReport } from "../services/messaging/groupReportModeration.service";

const router = Router();
router.use(authMiddleware, authRateLimit);
let schemaReady: Promise<void> | null = null;

async function ensureSchema() {
  await pool.query(`
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_source varchar(40) NOT NULL DEFAULT 'general';
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS exit_after_report boolean NOT NULL DEFAULT false;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS evidence_message_count integer NOT NULL DEFAULT 0;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_model varchar(100);
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_categories jsonb;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_category_scores jsonb;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_decision varchar(50);
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_reviewed_at timestamptz;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS email_notification_sent_at timestamptz;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS email_notification_error text;
    CREATE TABLE IF NOT EXISTS report_evidence_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      sender_id uuid NOT NULL REFERENCES user_profiles(id),
      message_type varchar(40) NOT NULL,
      sent_at timestamptz NOT NULL,
      moderation_text text,
      metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT report_evidence_messages_report_message_unique UNIQUE (report_id, message_id)
    );
    CREATE INDEX IF NOT EXISTS report_evidence_messages_report_idx ON report_evidence_messages(report_id, sent_at DESC);
  `);
}

router.use(async (_req, _res, next) => {
  try {
    schemaReady ??= ensureSchema().catch((error) => { schemaReady = null; throw error; });
    await schemaReady;
    next();
  } catch (error) {
    next(error);
  }
});

async function profileFor(userId: string) {
  const [profile] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return profile?.id ?? null;
}

async function activeMember(conversationId: string, profileId: string) {
  const [member] = await db.select({ id: conversationParticipants.id, role: conversationParticipants.role }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, profileId), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.temporarilySuspended, false), eq(conversationParticipants.permanentlyRemoved, false))).limit(1);
  return member ?? null;
}

const reasonSchema = z.string().trim().min(1).max(60);

router.post("/groups/:conversationId/report", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId);
  const body = z.object({ reason: reasonSchema, details: z.string().trim().max(5000).optional(), exitAfterReport: z.boolean().default(false) }).strict().safeParse(req.body);
  if (!req.user?.userId || !id.success || !body.success) return void res.status(400).json({ success: false, message: "A valid report reason and group are required." });

  const reporter = await profileFor(req.user.userId);
  if (!reporter) return void res.status(404).json({ success: false, message: "Profile not found." });
  const member = await activeMember(id.data, reporter);
  if (!member) return void res.status(403).json({ success: false, message: "You do not have access to this group." });

  const [group] = await db.select({ id: conversations.id, groupName: conversations.groupName, conversationType: conversations.conversationType }).from(conversations).where(and(eq(conversations.id, id.data), eq(conversations.deleted, false))).limit(1);
  if (!group || group.conversationType !== "group") return void res.status(404).json({ success: false, message: "Group not found." });

  const recent = await db.select({ id: messages.id, senderId: messages.senderId, messageType: messages.messageType, message: messages.message, caption: messages.caption, createdAt: messages.createdAt, deletedForEveryone: messages.deletedForEveryone }).from(messages).where(and(eq(messages.conversationId, id.data), ne(messages.senderId, reporter), eq(messages.deletedForEveryone, false))).orderBy(desc(messages.createdAt)).limit(5);

  const [created] = await db.insert(reports).values({
    reporterUserId: reporter,
    reportedUserId: null,
    reportTarget: "group",
    targetId: id.data,
    reportReason: body.data.reason.toLowerCase(),
    additionalDetails: body.data.details ?? null,
    reportSource: "group_info",
    exitAfterReport: body.data.exitAfterReport,
    evidenceMessageCount: recent.length,
    aiReviewed: false,
    autoHidden: false,
    autoRemoved: false,
    requiresHumanReview: true,
    moderatorAction: "pending",
    status: "open",
    priority: "normal",
  }).returning({ id: reports.id });
  if (!created) return void res.status(500).json({ success: false, message: "Unable to create report." });

  if (recent.length) {
    await db.insert(reportEvidenceMessages).values(recent.map((item) => ({
      reportId: created.id,
      messageId: item.id,
      senderId: item.senderId,
      messageType: item.messageType,
      sentAt: item.createdAt,
      moderationText: [item.message, item.caption].filter((value): value is string => Boolean(value?.trim())).join("\n").slice(0, 12000) || null,
      metadata: { messageType: item.messageType },
    })));
  }

  const result = await moderateGroupReport(created.id);
  res.status(201).json({ success: true, reported: true, reportId: created.id, groupName: group.groupName, ...result });
});

router.get("/reports/:reportId", async (req, res) => {
  const reportId = z.string().uuid().safeParse(req.params.reportId);
  if (!req.user?.userId || !reportId.success) return void res.status(400).json({ success: false, message: "Invalid report." });
  const reporter = await profileFor(req.user.userId);
  if (!reporter) return void res.status(404).json({ success: false, message: "Profile not found." });
  const [report] = await db.select({ id: reports.id, status: reports.status, reportReason: reports.reportReason, aiReviewed: reports.aiReviewed, aiDecision: reports.aiDecision, aiCategories: reports.aiCategories, aiRecommendedAction: reports.aiRecommendedAction, requiresHumanReview: reports.requiresHumanReview, autoRemoved: reports.autoRemoved, exitAfterReport: reports.exitAfterReport, evidenceMessageCount: reports.evidenceMessageCount, createdAt: reports.createdAt, reviewedAt: reports.reviewedAt, emailNotificationSentAt: reports.emailNotificationSentAt }).from(reports).where(and(eq(reports.id, reportId.data), eq(reports.reporterUserId, reporter))).limit(1);
  if (!report) return void res.status(404).json({ success: false, message: "Report not found." });
  res.json({ success: true, report });
});

export default router;
