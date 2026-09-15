import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "../../database/db";
import { conversations } from "../../database/conversations";
import { conversationParticipants } from "../../database/conversationParticipants";
import { messages } from "../../database/messages";
import { reports } from "../../database/reports";
import { reportEvidenceMessages } from "../../database/reportEvidenceMessages";
import { users } from "../../database/schema";
import { userProfiles } from "../../database/userProfiles";
import { env } from "../../config/env";
import { openai } from "../../lib/openai";
import { resend } from "../../lib/resend";

const MODEL = "omni-moderation-latest";

function categoryNames(categories: Record<string, boolean>) {
  return Object.entries(categories).filter(([, value]) => value).map(([key]) => key);
}

function htmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

async function notifyReporter(reportId: string, result: { status: string; decision: string; categories: string[]; evidenceCount: number; groupName: string; reason: string; exitAfterReport: boolean }) {
  const [recipient] = await db.select({ email: users.email, emailVerified: users.emailVerified, displayName: userProfiles.displayName }).from(reports).innerJoin(userProfiles, eq(userProfiles.id, reports.reporterUserId)).innerJoin(users, eq(users.id, userProfiles.userId)).where(eq(reports.id, reportId)).limit(1);
  if (!recipient?.email || !recipient.emailVerified) return;

  const sentAt = new Date();
  const categoryText = result.categories.length ? result.categories.join(", ") : "No harmful-content category was detected";
  const subject = `ReDom report ${reportId.slice(0, 8)} — ${result.status.replace(/_/g, " ")}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f7;font-family:Inter,Arial,sans-serif;color:#101828"><div style="max-width:640px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e4e7ec"><div style="background:#1877f2;color:#fff;padding:22px 26px"><strong style="font-size:20px">ReDom Reports</strong><div style="margin-top:4px;font-size:13px;opacity:.9">ReDom AI Moderation result</div></div><div style="padding:26px"><p>Hello ${htmlEscape(recipient.displayName || "ReDom user")},</p><p>Your report has completed the ReDom AI Moderation check. The reported group was not notified by this report.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:9px 0;color:#667085">Report</td><td style="padding:9px 0;font-weight:700">${htmlEscape(reportId)}</td></tr><tr><td style="padding:9px 0;color:#667085">Group</td><td style="padding:9px 0;font-weight:700">${htmlEscape(result.groupName)}</td></tr><tr><td style="padding:9px 0;color:#667085">Reason</td><td style="padding:9px 0">${htmlEscape(result.reason)}</td></tr><tr><td style="padding:9px 0;color:#667085">Status</td><td style="padding:9px 0;font-weight:700">${htmlEscape(result.status)}</td></tr><tr><td style="padding:9px 0;color:#667085">AI finding</td><td style="padding:9px 0">${htmlEscape(result.decision)}</td></tr><tr><td style="padding:9px 0;color:#667085">Categories</td><td style="padding:9px 0">${htmlEscape(categoryText)}</td></tr><tr><td style="padding:9px 0;color:#667085">Evidence checked</td><td style="padding:9px 0">${result.evidenceCount} recent message(s)</td></tr><tr><td style="padding:9px 0;color:#667085">Exit requested</td><td style="padding:9px 0">${result.exitAfterReport ? "Yes" : "No"}</td></tr></table><p style="margin-top:24px;color:#475467">ReDom AI Moderation checks the evidence supplied with a report and records the resulting moderation status. This email does not include private message content.</p><p style="color:#98a2b3;font-size:12px">ReDom Reports • ${sentAt.toISOString()}</p></div></div></body></html>`;

  try {
    await resend.emails.send({ from: env.email.reportsFrom, to: [recipient.email], subject, html });
    await db.update(reports).set({ emailNotificationSentAt: sentAt, emailNotificationError: null, updatedAt: sentAt }).where(eq(reports.id, reportId));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : "Unable to send report notification.";
    await db.update(reports).set({ emailNotificationError: message, updatedAt: new Date() }).where(eq(reports.id, reportId));
  }
}

async function exitReporterFromGroup(conversationId: string, profileId: string, role: string) {
  if (role === "owner") {
    const [replacement] = await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.permanentlyRemoved, false), ne(conversationParticipants.userId, profileId))).orderBy(conversationParticipants.joinedAt).limit(1);
    if (replacement) await db.update(conversationParticipants).set({ role: "owner", updatedAt: new Date() }).where(eq(conversationParticipants.id, replacement.id));
  }
  await db.update(conversationParticipants).set({ activeMember: false, leftGroup: true, leftAt: new Date(), updatedAt: new Date() }).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, profileId)));
  const [group] = await db.select({ participantCount: conversations.participantCount }).from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (group) await db.update(conversations).set({ participantCount: Math.max(0, group.participantCount - 1), updatedAt: new Date() }).where(eq(conversations.id, conversationId));
}

export async function moderateGroupReport(reportId: string) {
  const [report] = await db.select({ id: reports.id, reporterUserId: reports.reporterUserId, reportReason: reports.reportReason, exitAfterReport: reports.exitAfterReport, conversationId: reports.targetId, evidenceMessageCount: reports.evidenceMessageCount }).from(reports).where(eq(reports.id, reportId)).limit(1);
  if (!report?.conversationId) throw new Error("Group report not found.");

  const [group] = await db.select({ groupName: conversations.groupName }).from(conversations).where(eq(conversations.id, report.conversationId)).limit(1);
  const evidence = await db.select({ id: reportEvidenceMessages.id, messageId: reportEvidenceMessages.messageId, moderationText: reportEvidenceMessages.moderationText }).from(reportEvidenceMessages).where(eq(reportEvidenceMessages.reportId, reportId)).orderBy(desc(reportEvidenceMessages.sentAt));
  const moderationTexts = evidence.map((item) => item.moderationText).filter((value): value is string => Boolean(value?.trim()));

  let status = "under_review";
  let decision = "insufficient_evidence";
  let categories: string[] = [];
  let scores: Record<string, number> = {};
  let autoRemoved = false;
  let autoHidden = false;
  let requiresHumanReview = true;

  try {
    if (moderationTexts.length) {
      const response = await openai.moderations.create({ model: MODEL, input: moderationTexts.slice(0, 5).join("\n\n--- REPORTED MESSAGE ---\n\n").slice(0, 24000) });
      const result = response.results[0];
      const rawCategories = (result?.categories ?? {}) as unknown as Record<string, boolean>;
      const rawScores = (result?.category_scores ?? {}) as unknown as Record<string, number>;
      categories = categoryNames(rawCategories);
      scores = rawScores;
      if (result?.flagged) {
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
    await tx.update(reports).set({ aiReviewed: true, aiModel: MODEL, aiCategories: categories, aiCategoryScores: scores, aiDecision: decision, aiConfidenceScore: Object.values(scores).length ? Math.max(...Object.values(scores)) : null, aiRecommendedAction: autoRemoved ? "content_removed" : decision === "no_violation_detected" ? "no_violation" : "escalate", autoRemoved, autoHidden, requiresHumanReview, moderatorAction: autoRemoved ? "content_removed" : decision === "no_violation_detected" ? "no_violation" : "pending", status, reviewedAt: now, aiReviewedAt: now, closedAt: status === "closed" ? now : null, updatedAt: now }).where(eq(reports.id, reportId));
    if (autoRemoved && evidence.length) {
      await tx.update(messages).set({ aiReviewed: true, moderationStatus: "removed", restrictedMessage: true, spamDetected: categories.some((c) => c.startsWith("spam")), scamDetected: categories.some((c) => c.includes("fraud") || c.includes("scam") || c.includes("illicit")), adultContentDetected: categories.some((c) => c.startsWith("sexual")), violenceDetected: categories.some((c) => c.startsWith("violence")), hateSpeechDetected: categories.some((c) => c.startsWith("hate")), updatedAt: now }).where(eq(messages.id, evidence[0].messageId));
    }
  });

  if (report.exitAfterReport) {
    const [actor] = await db.select({ role: conversationParticipants.role }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, report.conversationId), eq(conversationParticipants.userId, report.reporterUserId), eq(conversationParticipants.activeMember, true))).limit(1);
    if (actor) await exitReporterFromGroup(report.conversationId, report.reporterUserId, actor.role);
  }

  await notifyReporter(reportId, { status, decision, categories, evidenceCount: evidence.length, groupName: group?.groupName || "ReDom group", reason: report.reportReason, exitAfterReport: report.exitAfterReport });
  return { reportId, status, decision, categories, evidenceCount: evidence.length, emailChecked: true };
}
