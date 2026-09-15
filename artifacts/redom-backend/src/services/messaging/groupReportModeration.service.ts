import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../database/db";
import { conversations } from "../../database/conversations";
import { conversationParticipants } from "../../database/conversationParticipants";
import { messages } from "../../database/messages";
import { messageDeletions } from "../../database/messageDeletions";
import { notifications } from "../../database/notifications";
import { reports } from "../../database/reports";
import { reportEvidenceMessages } from "../../database/reportEvidenceMessages";
import { users } from "../../database/schema";
import { userProfiles } from "../../database/userProfiles";
import { userSettings } from "../../database/userSettings";
import { sendReportResultEmail } from "./reportEmail.service";
import { sendModerationActionEmail } from "./moderationEmail.service";
import { openai } from "../../lib/openai";

const MODERATION_MODEL = "omni-moderation-latest";
const ACTION_MODEL = "gpt-5.6-luna";
const ACTIONS = ["no_action", "restrict_message", "remove_message", "warn_sender", "restrict_sender", "remove_sender_from_group"] as const;
type ModerationAction = typeof ACTIONS[number];

function categoryNames(categories: Record<string, boolean>) {
  return Object.entries(categories).filter(([, value]) => value).map(([key]) => key);
}

function actionLabel(action: ModerationAction): string {
  switch (action) {
    case "restrict_message": return "Message restricted";
    case "remove_message": return "Message removed";
    case "warn_sender": return "Warning issued to the message author";
    case "restrict_sender": return "Sender restricted in the group";
    case "remove_sender_from_group": return "Sender removed from the group";
    default: return "No action";
  }
}

async function decideAction(input: { text: string; categories: string[]; scores: Record<string, number>; flagged: boolean }): Promise<ModerationAction> {
  if (!input.flagged) return "no_action";
  const response = await openai.responses.create({
    model: ACTION_MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: "You are ReDom AI Moderation. Decide the single appropriate enforcement action for the supplied message after reviewing the message and the OpenAI moderation signals. You are not a user-facing assistant and you must not discuss reports. Return JSON only in the exact shape {\"action\":\"...\"}. Allowed actions: no_action, restrict_message, remove_message, warn_sender, restrict_sender, remove_sender_from_group. Prefer the least severe action that adequately protects ReDom. Use remove_sender_from_group only when the content indicates a serious group safety threat. Do not invent facts not present in the supplied content or moderation signals." }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify({ message: input.text.slice(0, 12000), flagged: input.flagged, categories: input.categories, categoryScores: input.scores }) }],
      },
    ],
  });
  const parsed = JSON.parse(response.output_text) as { action?: unknown };
  return typeof parsed.action === "string" && (ACTIONS as readonly string[]).includes(parsed.action) ? parsed.action as ModerationAction : "no_action";
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

  const [recipient] = await db.select({ email: users.email, emailVerified: users.emailVerified, displayName: userProfiles.displayName }).from(reports)
    .innerJoin(userProfiles, eq(userProfiles.id, reports.reporterUserId))
    .innerJoin(users, eq(users.id, userProfiles.userId))
    .where(eq(reports.id, reportId)).limit(1);
  if (!recipient?.email || !recipient.emailVerified) return { eligible: false, sent: false, alreadySent: false };

  const emailResult = await sendReportResultEmail({ to: recipient.email, displayName: recipient.displayName || "ReDom user", reportId, groupName: result.groupName, reason: result.reason, status: result.status, decision: result.decision, categories: result.categories, evidenceCount: result.evidenceCount, exitAfterReport: result.exitAfterReport, language: result.language });
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
      .orderBy(conversationParticipants.joinedAt).limit(1);
    if (replacement) await db.update(conversationParticipants).set({ role: "owner", updatedAt: new Date() }).where(eq(conversationParticipants.id, replacement.id));
  }
  await db.update(conversationParticipants).set({ activeMember: false, leftGroup: true, leftAt: new Date(), updatedAt: new Date() })
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, profileId)));
  const [group] = await db.select({ participantCount: conversations.participantCount }).from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (group) await db.update(conversations).set({ participantCount: Math.max(0, group.participantCount - 1), updatedAt: new Date() }).where(eq(conversations.id, conversationId));
}

async function deliverModerationActionNotifications(input: {
  reportId: string;
  conversationId: string;
  groupName: string;
  actions: Array<{ messageId: string; senderId: string; action: ModerationAction }>;
}) {
  const effective = input.actions.filter((item) => item.action !== "no_action");
  if (!effective.length) return { recipients: 0, emailsSent: 0 };

  const ownerRows = await db.select({ userId: conversationParticipants.userId }).from(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, input.conversationId), eq(conversationParticipants.role, "owner"), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.permanentlyRemoved, false))).limit(1);
  const recipientIds = new Set<string>();
  if (ownerRows[0]?.userId) recipientIds.add(ownerRows[0].userId);
  for (const action of effective) recipientIds.add(action.senderId);
  if (!recipientIds.size) return { recipients: 0, emailsSent: 0 };

  const firstMessageId = effective[0].messageId;
  const actionSummary = [...new Set(effective.map((item) => actionLabel(item.action)))];
  let emailsSent = 0;

  for (const recipientId of recipientIds) {
    const [recipient] = await db.select({
      profileId: userProfiles.id,
      userId: userProfiles.userId,
      email: users.email,
      emailVerified: users.emailVerified,
      displayName: userProfiles.displayName,
      language: userSettings.language,
    }).from(userProfiles)
      .innerJoin(users, eq(users.id, userProfiles.userId))
      .leftJoin(userSettings, eq(userSettings.userId, userProfiles.userId))
      .where(eq(userProfiles.id, recipientId)).limit(1);
    if (!recipient) continue;

    const isAuthor = effective.some((item) => item.senderId === recipient.profileId);
    const body = isAuthor
      ? `A message you sent in "${input.groupName || "your ReDom group"}" was found to violate ReDom rules. Action taken: ${actionSummary.join(", ")}.`
      : `A message in "${input.groupName || "your ReDom group"}" was found to violate ReDom rules. Action taken: ${actionSummary.join(", ")}.`;
    const actionUrl = `redom://messages/${input.conversationId}?moderation=${input.reportId}`;

    const [existing] = await db.select({ id: notifications.id, emailSent: notifications.emailSent }).from(notifications)
      .where(and(eq(notifications.recipientUserId, recipient.profileId), eq(notifications.notificationType, "moderation_action_taken"), eq(notifications.actionUrl, actionUrl))).limit(1);

    let notificationId = existing?.id;
    if (!notificationId) {
      const [created] = await db.insert(notifications).values({
        recipientUserId: recipient.profileId,
        actorUserId: null,
        messageId: firstMessageId,
        conversationId: input.conversationId,
        groupId: input.conversationId,
        notificationType: "moderation_action_taken",
        title: "ReDom safety action taken",
        body,
        actionUrl,
        unread: true,
        read: false,
        inAppDelivered: true,
        emailSent: false,
        priority: "high",
      }).returning({ id: notifications.id });
      notificationId = created?.id;
    }

    if (!recipient.email || !recipient.emailVerified || existing?.emailSent) continue;
    const emailResult = await sendModerationActionEmail({
      to: recipient.email,
      displayName: recipient.displayName || "ReDom user",
      groupName: input.groupName || "your ReDom group",
      actions: actionSummary,
      language: recipient.language === "system" ? "en" : (recipient.language || "en"),
    });
    if (emailResult.sent && notificationId) {
      emailsSent += 1;
      await db.update(notifications).set({ emailSent: true, updatedAt: new Date() }).where(eq(notifications.id, notificationId));
    }
  }
  return { recipients: recipientIds.size, emailsSent };
}

export async function moderateGroupReport(reportId: string) {
  const [report] = await db.select({ id: reports.id, reporterUserId: reports.reporterUserId, reportReason: reports.reportReason, exitAfterReport: reports.exitAfterReport, notificationLanguage: reports.notificationLanguage, conversationId: reports.targetId }).from(reports).where(eq(reports.id, reportId)).limit(1);
  if (!report?.conversationId) throw new Error("Group report not found.");

  const [group] = await db.select({ groupName: conversations.groupName }).from(conversations).where(eq(conversations.id, report.conversationId)).limit(1);
  const evidence = await db.select({ id: reportEvidenceMessages.id, messageId: reportEvidenceMessages.messageId, moderationText: reportEvidenceMessages.moderationText }).from(reportEvidenceMessages).where(eq(reportEvidenceMessages.reportId, reportId)).orderBy(desc(reportEvidenceMessages.sentAt));
  const reviewable = evidence.filter((item): item is typeof item & { moderationText: string } => Boolean(item.moderationText?.trim()));

  let status = "under_review";
  let decision = "insufficient_evidence";
  let categories: string[] = [];
  let scores: Record<string, number> = {};
  let autoRemoved = false;
  let autoHidden = false;
  let requiresHumanReview = true;
  const moderationActions: Array<{ messageId: string; senderId: string; action: ModerationAction }> = [];

  try {
    if (reviewable.length) {
      const results = await Promise.all(reviewable.slice(0, 5).map(async (item) => ({
        messageId: item.messageId,
        moderationText: item.moderationText,
        result: (await openai.moderations.create({ model: MODERATION_MODEL, input: item.moderationText.slice(0, 12000) })).results[0],
      })));
      const categorySet = new Set<string>();
      for (const item of results) {
        const rawCategories = (item.result?.categories ?? {}) as unknown as Record<string, boolean>;
        const rawScores = (item.result?.category_scores ?? {}) as unknown as Record<string, number>;
        for (const category of categoryNames(rawCategories)) categorySet.add(category);
        for (const [key, value] of Object.entries(rawScores)) scores[key] = Math.max(scores[key] ?? 0, value);
        if (item.result?.flagged) {
          const [source] = await db.select({ senderId: messages.senderId }).from(messages).where(eq(messages.id, item.messageId)).limit(1);
          if (source) {
            try {
              const action = await decideAction({ text: item.moderationText, categories: categoryNames(rawCategories), scores: rawScores, flagged: true });
              if (action !== "no_action") moderationActions.push({ messageId: item.messageId, senderId: source.senderId, action });
            } catch (error) {
              console.error("ReDom AI moderation action decision failed", error);
            }
          }
        }
      }
      categories = [...categorySet];
      if (moderationActions.length) {
        status = "closed";
        decision = "violation_detected";
        autoRemoved = moderationActions.some((item) => item.action === "remove_message" || item.action === "remove_sender_from_group");
        autoHidden = moderationActions.some((item) => item.action === "restrict_message" || item.action === "remove_message");
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
      aiModel: `${MODERATION_MODEL}+${ACTION_MODEL}`,
      aiCategories: categories,
      aiCategoryScores: scores,
      aiDecision: decision,
      aiConfidenceScore: Object.values(scores).length ? Math.max(...Object.values(scores)) : null,
      aiRecommendedAction: moderationActions.length ? [...new Set(moderationActions.map((item) => item.action))].join(",") : decision === "no_violation_detected" ? "no_violation" : "escalate",
      autoRemoved,
      autoHidden,
      requiresHumanReview,
      moderatorAction: moderationActions.length ? [...new Set(moderationActions.map((item) => item.action))].join(",").slice(0, 40) : decision === "no_violation_detected" ? "no_violation" : "pending",
      status,
      reviewedAt: now,
      aiReviewedAt: now,
      closedAt: status === "closed" ? now : null,
      updatedAt: now,
    }).where(eq(reports.id, reportId));

    for (const item of moderationActions) {
      if (item.action === "restrict_message" || item.action === "remove_message") {
        await tx.update(messages).set({
          aiReviewed: true,
          moderationStatus: item.action === "remove_message" ? "removed" : "restricted",
          restrictedMessage: true,
          deletedForEveryone: item.action === "remove_message" ? true : false,
          deletedPlaceholder: item.action === "remove_message" ? true : false,
          deletedAt: item.action === "remove_message" ? now : null,
          spamDetected: categories.some((c) => c.startsWith("spam")),
          scamDetected: categories.some((c) => c.includes("fraud") || c.includes("scam") || c.includes("illicit")),
          adultContentDetected: categories.some((c) => c.startsWith("sexual")),
          violenceDetected: categories.some((c) => c.startsWith("violence")),
          hateSpeechDetected: categories.some((c) => c.startsWith("hate")),
          systemAction: actionLabel(item.action),
          updatedAt: now,
        }).where(eq(messages.id, item.messageId));
      } else if (item.action === "warn_sender") {
        await tx.update(messages).set({ aiReviewed: true, moderationStatus: "warned", systemAction: actionLabel(item.action), updatedAt: now }).where(eq(messages.id, item.messageId));
        await tx.update(conversationParticipants).set({ warningCount: sql`${conversationParticipants.warningCount} + 1`, updatedAt: now }).where(and(eq(conversationParticipants.conversationId, report.conversationId!), eq(conversationParticipants.userId, item.senderId)));
      } else if (item.action === "restrict_sender") {
        await tx.update(conversationParticipants).set({ temporarilySuspended: true, updatedAt: now }).where(and(eq(conversationParticipants.conversationId, report.conversationId!), eq(conversationParticipants.userId, item.senderId), eq(conversationParticipants.activeMember, true)));
      } else if (item.action === "remove_sender_from_group") {
        await tx.update(conversationParticipants).set({ activeMember: false, permanentlyRemoved: true, removedByAi: true, leftGroup: true, leftAt: now, updatedAt: now }).where(and(eq(conversationParticipants.conversationId, report.conversationId!), eq(conversationParticipants.userId, item.senderId), eq(conversationParticipants.activeMember, true)));
      }
    }
  });

  const removedProfiles = new Set(moderationActions.filter((item) => item.action === "remove_sender_from_group").map((item) => item.senderId));
  if (removedProfiles.size) await db.update(conversations).set({ participantCount: sql`GREATEST(0, ${conversations.participantCount} - ${removedProfiles.size})`, updatedAt: now }).where(eq(conversations.id, report.conversationId));

  if (report.exitAfterReport) {
    await deleteChatForReporter(report.conversationId, report.reporterUserId);
    const [actor] = await db.select({ role: conversationParticipants.role }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, report.conversationId), eq(conversationParticipants.userId, report.reporterUserId), eq(conversationParticipants.activeMember, true))).limit(1);
    if (actor) await exitReporterFromGroup(report.conversationId, report.reporterUserId, actor.role);
  }

  const actionNotifications = await deliverModerationActionNotifications({ reportId, conversationId: report.conversationId, groupName: group?.groupName || "ReDom group", actions: moderationActions });
  const emailNotification = await notifyReporter(reportId, { status, decision, categories, evidenceCount: evidence.length, groupName: group?.groupName || "ReDom group", reason: report.reportReason, exitAfterReport: report.exitAfterReport, language: report.notificationLanguage });

  return {
    reportId,
    status,
    decision,
    categories,
    evidenceCount: evidence.length,
    moderationActions: moderationActions.map((item) => ({ messageId: item.messageId, action: item.action })),
    actionNotifications: actionNotifications.recipients,
    moderationEmailsSent: actionNotifications.emailsSent,
    emailNotificationEligible: emailNotification.eligible,
    emailNotificationSent: emailNotification.sent,
  };
}
