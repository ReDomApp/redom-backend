import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "../../database/db";
import { conversations } from "../../database/conversations";
import { conversationParticipants } from "../../database/conversationParticipants";
import { messages } from "../../database/messages";
import { messageDeletions } from "../../database/messageDeletions";
import { reports } from "../../database/reports";
import { reportEvidenceMessages } from "../../database/reportEvidenceMessages";
import { users } from "../../database/schema";
import { userProfiles } from "../../database/userProfiles";
import { sendReportResultEmail } from "./reportEmail.service";
import { openai } from "../../lib/openai";

const MODEL = "omni-moderation-latest";

function categoryNames(categories: Record<string, boolean>) {
  return Object.entries(categories).filter(([, value]) => value).map(([key]) => key);
}

async function notifyReporter(reportId: string, result: {
  status: string;
  decision: string;
  categories: string[];
  evidenceCount: number;
  groupName: string;
  reason: string;
  exitAfterReport: boolean;
  language: string;
}) {
  const [report] = await db.select({ emailNotificationSentAt: reports.emailNotificationSentAt }).from(reports).where(eq(reports.id, reportId)).limit(1);
  if (report?.emailNotificationSentAt) return { eligible: true, sent: false, alreadySent: true };

  const [recipient] = await db.select({
    email: users.email,
    emailVerified: users.emailVerified,
    displayName: userProfiles.displayName,
  }).from(reports)
    .innerJoin(userProfiles, eq(userProfiles.id, reports.reporterUserId))
    .innerJoin(users, eq(users.id, userProfiles.userId))
    .where(eq(reports.id, reportId))
    .limit(1);

  if (!recipient?.email || !recipient.emailVerified) return { eligible: false, sent: false, alreadySent: false };

  const emailResult = await sendReportResultEmail({
    to: recipient.email,
    displayName: recipient.displayName || "ReDom user",
    reportId,
    groupName: result.groupName,
    reason: result.reason,
    status: result.status,
    decision: result.decision,
    categories: result.categories,
    evidenceCount: result.evidenceCount,
    exitAfterReport: result.exitAfterReport,
    language: result.language,
  });

  const now = new Date();
  if (emailResult.sent) {
    await db.update(reports).set({ emailNotificationSentAt: now, emailNotificationError: null, updatedAt: now }).where(eq(reports.id, reportId));
    return { eligible: true, sent: true, alreadySent: false };
  }

  await db.update(reports).set({ emailNotificationError: emailResult.error ?? "Report notification could not be sent.", updatedAt: now }).where(eq(reports.id, reportId));
  return { eligible: true, sent: false, alreadySent: false };
}

async function deleteChatForReporter(conversationId: string, profileId: string) {
  const rows = await db.select({ id: messages.id }).from(messages).where(eq(messages.conversationId, conversationId));
  if (rows.length) await db.insert(messageDeletions).values(rows.map((row) => ({ messageId: row.id, userId: profileId }))).onConflictDoNothing();
}

async function exitReporterFromGroup(conversationId: string, profileId: string, role: string) {
  if (role === "owner") {
    const [replacement] = await db.select({ id: conversationParticipants.id }).from(conversationParticipants)
      .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.permanentlyRemoved, false), ne(conversationParticipants.userId, profileId)))
      .orderBy(conversationParticipants.joinedAt)
      .limit(1);
    if (replacement) await db.update(conversationParticipants).set({ role: "owner", updatedAt: new Date() }).where(eq(conversationParticipants.id, replacement.id));
  }

  await db.update(conversationParticipants).set({ activeMember: false, leftGroup: true, leftAt: new Date(), updatedAt: new Date() })
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, profileId)));

  const [group] = await db.select({ participantCount: conversations.participantCount }).from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (group) await db.update(conversations).set({ participantCount: Math.max(0, group.participantCount - 1), updatedAt: new Date() }).where(eq(conversations.id, conversationId));
}

export async function moderateGroupReport(reportId: string) {
  const [report] = await db.select({
    id: reports.id,
    reporterUserId: reports.reporterUserId,
    reportReason: reports.reportReason,
    exitAfterReport: reports.exitAfterReport,
    notificationLanguage: reports.notificationLanguage,
    conversationId: reports.targetId,
  }).from(reports).where(eq(reports.id, reportId)).limit(1);

  if (!report?.conversationId) throw new Error("Group report not found.");

  const [group] = await db.select({ groupName: conversations.groupName }).from(conversations).where(eq(conversations.id, report.conversationId)).limit(1);
  const evidence = await db.select({
    id: reportEvidenceMessages.id,
    messageId: reportEvidenceMessages.messageId,
    moderationText: reportEvidenceMessages.moderationText,
  }).from(reportEvidenceMessages).where(eq(reportEvidenceMessages.reportId, reportId)).orderBy(desc(reportEvidenceMessages.sentAt));

  const reviewable = evidence.filter((item): item is typeof item & { moderationText: string } => Boolean(item.moderationText?.trim()));

  let status = "under_review";
  let decision = "insufficient_evidence";
  let categories: string[] = [];
  let scores: Record<string, number> = {};
  let autoRemoved = false;
  let autoHidden = false;
  let requiresHumanReview = true;
  let flaggedMessageIds: string[] = [];

  try {
    if (reviewable.length) {
      const results = await Promise.all(reviewable.slice(0, 5).map(async (item) => ({
        messageId: item.messageId,
        result: (await openai.moderations.create({ model: MODEL, input: item.moderationText.slice(0, 12000) })).results[0],
      })));

      const categorySet = new Set<string>();
      for (const item of results) {
        const rawCategories = (item.result?.categories ?? {}) as unknown as Record<string, boolean>;
        const rawScores = (item.result?.category_scores ?? {}) as unknown as Record<string, number>;
        for (const category of categoryNames(rawCategories)) categorySet.add(category);
        for (const [key, value] of Object.entries(rawScores)) scores[key] = Math.max(scores[key] ?? 0, value);
        if (item.result?.flagged) flaggedMessageIds.push(item.messageId);
      }

      categories = [...categorySet];
      if (flaggedMessageIds.length) {
        status = "closed";
        decision = "violation_detected";
        autoRemoved = true;
        autoHidden = true;
        requiresHumanReview = false;
      } else {
        status = "closed";
        decision = "no_violation_detected";
        requiresHumanReview = false;
      }
    }
  } catch (error) {
    decision = "ai_review_failed";
    status = "under_review";
    requiresHumanReview = true;
    console.error("ReDom AI group report moderation failed", error);
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(reports).set({
      aiReviewed: true,
      aiModel: MODEL,
      aiCategories: categories,
      aiCategoryScores: scores,
      aiDecision: decision,
      aiConfidenceScore: Object.values(scores).length ? Math.max(...Object.values(scores)) : null,
      aiRecommendedAction: autoRemoved ? "content_removed" : decision === "no_violation_detected" ? "no_violation" : "escalate",
      autoRemoved,
      autoHidden,
      requiresHumanReview,
      moderatorAction: autoRemoved ? "content_removed" : decision === "no_violation_detected" ? "no_violation" : "pending",
      status,
      reviewedAt: now,
      aiReviewedAt: now,
      closedAt: status === "closed" ? now : null,
      updatedAt: now,
    }).where(eq(reports.id, reportId));

    if (autoRemoved && flaggedMessageIds.length) {
      await tx.update(messages).set({
        aiReviewed: true,
        moderationStatus: "removed",
        restrictedMessage: true,
        spamDetected: categories.some((c) => c.startsWith("spam")),
        scamDetected: categories.some((c) => c.includes("fraud") || c.includes("scam") || c.includes("illicit")),
        adultContentDetected: categories.some((c) => c.startsWith("sexual")),
        violenceDetected: categories.some((c) => c.startsWith("violence")),
        hateSpeechDetected: categories.some((c) => c.startsWith("hate")),
        updatedAt: now,
      }).where(inArray(messages.id, flaggedMessageIds));
    }
  });

  if (report.exitAfterReport) {
    await deleteChatForReporter(report.conversationId, report.reporterUserId);
    const [actor] = await db.select({ role: conversationParticipants.role }).from(conversationParticipants)
      .where(and(eq(conversationParticipants.conversationId, report.conversationId), eq(conversationParticipants.userId, report.reporterUserId), eq(conversationParticipants.activeMember, true))).limit(1);
    if (actor) await exitReporterFromGroup(report.conversationId, report.reporterUserId, actor.role);
  }

  const emailNotification = await notifyReporter(reportId, {
    status,
    decision,
    categories,
    evidenceCount: evidence.length,
    groupName: group?.groupName || "ReDom group",
    reason: report.reportReason,
    exitAfterReport: report.exitAfterReport,
    language: report.notificationLanguage,
  });

  return {
    reportId,
    status,
    decision,
    categories,
    evidenceCount: evidence.length,
    emailNotificationEligible: emailNotification.eligible,
    emailNotificationSent: emailNotification.sent,
  };
}
