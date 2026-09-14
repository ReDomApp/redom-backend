import { Router } from "express";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { db } from "../database/db";
import { conversations } from "../database/conversations";
import { conversationParticipants } from "../database/conversationParticipants";
import { messages } from "../database/messages";
import { reactions } from "../database/reactions";
import { notifications } from "../database/notifications";
import { activityLog } from "../database/activityLog";
import { userProfiles } from "../database/userProfiles";

const router = Router();
const MESSAGE_CONTENT_TYPE = "message";
const reactionSchema = z.enum(["like", "love", "haha", "wow", "sad", "angry"]);

async function currentProfileUuid(userId: string) {
  const [profile] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return profile?.id ?? null;
}

async function requireMessageAccess(userId: string, messageId: string) {
  const profileId = await currentProfileUuid(userId);
  if (!profileId) return { profileId: null, message: null };
  const [row] = await db.select({ message: messages, participantId: conversationParticipants.id }).from(messages).innerJoin(conversationParticipants, and(eq(conversationParticipants.conversationId, messages.conversationId), eq(conversationParticipants.userId, profileId), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.temporarilySuspended, false), eq(conversationParticipants.permanentlyRemoved, false))).where(and(eq(messages.id, messageId), eq(messages.deletedForEveryone, false))).limit(1);
  return { profileId, message: row?.message ?? null };
}

router.get("/messages/:messageId/reactions", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.userId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const messageId = z.string().uuid().safeParse(req.params.messageId);
  if (!messageId.success) { res.status(400).json({ success: false, message: "Invalid message id." }); return; }
  const access = await requireMessageAccess(req.user.userId, messageId.data);
  if (!access.profileId) { res.status(404).json({ success: false, message: "Profile not found." }); return; }
  if (!access.message) { res.status(403).json({ success: false, message: "You cannot access this message." }); return; }
  const rows = await db.select({ reactionType: reactions.reactionType, total: count(reactions.id) }).from(reactions).where(and(eq(reactions.contentType, MESSAGE_CONTENT_TYPE), eq(reactions.contentId, messageId.data), eq(reactions.active, true))).groupBy(reactions.reactionType);
  const mine = await db.select({ reactionType: reactions.reactionType }).from(reactions).where(and(eq(reactions.reactorId, access.profileId), eq(reactions.contentType, MESSAGE_CONTENT_TYPE), eq(reactions.contentId, messageId.data), eq(reactions.active, true))).limit(1);
  res.json({ success: true, reactions: rows, myReaction: mine[0]?.reactionType ?? null });
});

router.put("/messages/:messageId/reactions", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.userId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const messageId = z.string().uuid().safeParse(req.params.messageId);
  const parsed = z.object({ reactionType: reactionSchema }).safeParse(req.body);
  if (!messageId.success || !parsed.success) { res.status(400).json({ success: false, message: "A valid reaction is required." }); return; }
  const access = await requireMessageAccess(req.user.userId, messageId.data);
  if (!access.profileId) { res.status(404).json({ success: false, message: "Profile not found." }); return; }
  if (!access.message) { res.status(403).json({ success: false, message: "You cannot react to this message." }); return; }
  const now = new Date();
  const [existing] = await db.select().from(reactions).where(and(eq(reactions.reactorId, access.profileId), eq(reactions.contentType, MESSAGE_CONTENT_TYPE), eq(reactions.contentId, messageId.data))).limit(1);
  if (existing) {
    await db.update(reactions).set({ reactionType: parsed.data.reactionType, active: true, updatedAt: now }).where(eq(reactions.id, existing.id));
  } else {
    await db.insert(reactions).values({ reactorId: access.profileId, contentType: MESSAGE_CONTENT_TYPE, contentId: messageId.data, reactionType: parsed.data.reactionType, active: true, spamDetected: false, aiReviewed: false, createdAt: now, updatedAt: now });
  }
  await db.update(messages).set({ reactionCount: (await db.select({ total: count(reactions.id) }).from(reactions).where(and(eq(reactions.contentType, MESSAGE_CONTENT_TYPE), eq(reactions.contentId, messageId.data), eq(reactions.active, true))))[0]?.total ?? 0, updatedAt: now }).where(eq(messages.id, messageId.data));
  if (access.message.senderId !== access.profileId) {
    await db.insert(notifications).values({ recipientUserId: access.message.senderId, actorUserId: access.profileId, messageId: messageId.data, conversationId: access.message.conversationId, notificationType: "message_reaction", title: "New reaction", body: `Someone reacted ${parsed.data.reactionType} to your ReDom message.`, actionUrl: `redom://messages/${access.message.conversationId}`, unread: true, read: false, inAppDelivered: true, priority: "normal" });
  }
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "message_reaction_added", activityCategory: "messages", activityTitle: "Message reaction added", activityDescription: "A reaction was added to a ReDom message.", targetId: messageId.data, targetType: "message", targetUrl: `redom://messages/${access.message.conversationId}`, status: "success", triggeredBy: "user", source: "app", undoSupported: true, hidden: false, archived: false });
  res.json({ success: true, reactionType: parsed.data.reactionType });
});

router.delete("/messages/:messageId/reactions", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.userId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const messageId = z.string().uuid().safeParse(req.params.messageId);
  if (!messageId.success) { res.status(400).json({ success: false, message: "Invalid message id." }); return; }
  const access = await requireMessageAccess(req.user.userId, messageId.data);
  if (!access.profileId) { res.status(404).json({ success: false, message: "Profile not found." }); return; }
  if (!access.message) { res.status(403).json({ success: false, message: "You cannot modify this message reaction." }); return; }
  const now = new Date();
  await db.update(reactions).set({ active: false, updatedAt: now }).where(and(eq(reactions.reactorId, access.profileId), eq(reactions.contentType, MESSAGE_CONTENT_TYPE), eq(reactions.contentId, messageId.data), eq(reactions.active, true)));
  const [total] = await db.select({ total: count(reactions.id) }).from(reactions).where(and(eq(reactions.contentType, MESSAGE_CONTENT_TYPE), eq(reactions.contentId, messageId.data), eq(reactions.active, true)));
  await db.update(messages).set({ reactionCount: Number(total?.total ?? 0), updatedAt: now }).where(eq(messages.id, messageId.data));
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "message_reaction_removed", activityCategory: "messages", activityTitle: "Message reaction removed", activityDescription: "A reaction was removed from a ReDom message.", targetId: messageId.data, targetType: "message", targetUrl: `redom://messages/${access.message.conversationId}`, status: "success", triggeredBy: "user", source: "app", undoSupported: true, hidden: false, archived: false });
  res.json({ success: true });
});

export default router;
