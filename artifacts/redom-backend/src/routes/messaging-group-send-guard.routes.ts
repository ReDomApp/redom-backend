import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { db } from "../database/db";
import { conversations } from "../database/conversations";
import { conversationParticipants } from "../database/conversationParticipants";
import { userProfiles } from "../database/userProfiles";

const router = Router();
router.use(authMiddleware);

async function profileId(userId: string) {
  const [row] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return row?.id ?? null;
}

router.post("/conversations/:conversationId/messages", async (req, res, next) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const id = z.string().uuid().safeParse(req.params.conversationId);
  if (!id.success) return next();
  const me = await profileId(req.user.userId);
  if (!me) return void res.status(404).json({ success: false, message: "Profile not found." });
  const [conversation] = await db.select({ type: conversations.conversationType, anyoneCanSendMessages: conversations.anyoneCanSendMessages }).from(conversations).where(and(eq(conversations.id, id.data), eq(conversations.deleted, false))).limit(1);
  if (!conversation || conversation.type !== "group" || conversation.anyoneCanSendMessages) return next();
  const [member] = await db.select({ role: conversationParticipants.role }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.userId, me), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.temporarilySuspended, false), eq(conversationParticipants.permanentlyRemoved, false))).limit(1);
  if (!member) return void res.status(403).json({ success: false, message: "You are not an active member of this group." });
  if (member.role !== "owner" && member.role !== "admin") return void res.status(403).json({ success: false, message: "Only group admins can send messages in this group." });
  next();
});

export default router;
