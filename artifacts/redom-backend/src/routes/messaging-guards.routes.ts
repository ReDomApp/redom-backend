import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { db } from "../database/db";
import { conversations } from "../database/conversations";
import { conversationParticipants } from "../database/conversationParticipants";
import { userProfiles } from "../database/userProfiles";
import { blockedUsers } from "../database/blockedUsers";

const router = Router();
router.use(authMiddleware);

async function blockedForDirectConversation(conversationId: string, userId: string): Promise<boolean> {
  const [me] = await db.select({ profileId: userProfiles.id, userId: userProfiles.userId }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  const [conversation] = await db.select({ id: conversations.id, type: conversations.conversationType }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.deleted, false))).limit(1);
  if (!me || !conversation || conversation.type !== "direct") return false;
  const [other] = await db.select({ userId: userProfiles.userId }).from(conversationParticipants).innerJoin(userProfiles, eq(userProfiles.id, conversationParticipants.userId)).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.userId, me.profileId))).limit(1);
  if (!other) return false;
  const participants = await db.select({ userId: userProfiles.userId }).from(conversationParticipants).innerJoin(userProfiles, eq(userProfiles.id, conversationParticipants.userId)).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.activeMember, true)));
  const target = participants.find((p) => p.userId !== me.userId);
  if (!target) return false;
  const [block] = await db.select({ id: blockedUsers.id }).from(blockedUsers).where(and(eq(blockedUsers.userId, me.userId), eq(blockedUsers.blockedUserId, target.userId))).limit(1);
  const [reverse] = await db.select({ id: blockedUsers.id }).from(blockedUsers).where(and(eq(blockedUsers.userId, target.userId), eq(blockedUsers.blockedUserId, me.userId))).limit(1);
  return Boolean(block || reverse);
}

router.use("/conversations/:conversationId/messages", async (req, res, next) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const parsed = z.string().uuid().safeParse(req.params.conversationId);
  if (!parsed.success) return next();
  if (await blockedForDirectConversation(parsed.data, req.user.userId)) return void res.status(403).json({ success: false, code: "MESSAGING_BLOCKED", message: "Messaging is unavailable because one participant has blocked the other." });
  next();
});

router.use("/calls/conversations/:conversationId", async (req, res, next) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const parsed = z.string().uuid().safeParse(req.params.conversationId);
  if (!parsed.success) return next();
  if (await blockedForDirectConversation(parsed.data, req.user.userId)) return void res.status(403).json({ success: false, code: "CALLS_BLOCKED", message: "Calls are unavailable because one participant has blocked the other." });
  next();
});

export default router;
