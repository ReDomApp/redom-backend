import { Router } from "express";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { db } from "../database/db";
import { conversationParticipants } from "../database/conversationParticipants";
import { messageReads } from "../database/messageReads";
import { messages } from "../database/messages";
import { userProfiles } from "../database/userProfiles";

const router = Router();
router.use(authMiddleware, authRateLimit);

async function profileIdFor(userId: string) {
  const [profile] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return profile?.id ?? null;
}

async function requireMember(userId: string, conversationId: string) {
  const profileId = await profileIdFor(userId);
  if (!profileId) return null;
  const [member] = await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(
    eq(conversationParticipants.conversationId, conversationId),
    eq(conversationParticipants.userId, profileId),
    eq(conversationParticipants.activeMember, true),
    eq(conversationParticipants.temporarilySuspended, false),
    eq(conversationParticipants.permanentlyRemoved, false),
  )).limit(1);
  return member ? profileId : null;
}

router.post("/conversations/:conversationId/read-receipts", async (req, res) => {
  const conversationId = z.string().uuid().safeParse(req.params.conversationId);
  const body = z.object({ messageIds: z.array(z.string().uuid()).max(200).optional() }).strict().safeParse(req.body ?? {});
  if (!req.user?.userId || !conversationId.success || !body.success) return void res.status(400).json({ success: false, message: "Invalid read receipt request." });
  const reader = await requireMember(req.user.userId, conversationId.data);
  if (!reader) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });

  const candidateRows = await db.select({ id: messages.id }).from(messages).where(and(
    eq(messages.conversationId, conversationId.data),
    ne(messages.senderId, reader),
    eq(messages.deletedForEveryone, false),
    ...(body.data.messageIds?.length ? [inArray(messages.id, body.data.messageIds)] : []),
  )).limit(200);

  let recorded = 0;
  for (const row of candidateRows) {
    const [existing] = await db.select({ id: messageReads.id }).from(messageReads).where(and(eq(messageReads.messageId, row.id), eq(messageReads.readerId, reader))).limit(1);
    if (existing) {
      await db.update(messageReads).set({ read: true, readAt: new Date(), updatedAt: new Date() }).where(eq(messageReads.id, existing.id));
    } else {
      await db.insert(messageReads).values({ messageId: row.id, readerId: reader, sent: true, delivered: true, deliveredAt: new Date(), read: true, readAt: new Date(), readReceiptEnabled: true, readHidden: false });
      recorded += 1;
    }
  }

  await db.update(messages).set({ read: true, readAt: new Date(), updatedAt: new Date() }).where(and(eq(messages.conversationId, conversationId.data), ne(messages.senderId, reader), eq(messages.deletedForEveryone, false), ...(body.data.messageIds?.length ? [inArray(messages.id, body.data.messageIds)] : [])));
  await db.update(conversationParticipants).set({ unreadMessageCount: 0, updatedAt: new Date() }).where(and(eq(conversationParticipants.conversationId, conversationId.data), eq(conversationParticipants.userId, reader)));
  res.json({ success: true, readerId: reader, recorded, readAt: new Date().toISOString() });
});

router.get("/conversations/:conversationId/read-receipts", async (req, res) => {
  const conversationId = z.string().uuid().safeParse(req.params.conversationId);
  const messageId = z.string().uuid().safeParse(req.query.messageId);
  if (!req.user?.userId || !conversationId.success || !messageId.success) return void res.status(400).json({ success: false, message: "A valid conversation and message are required." });
  const viewer = await requireMember(req.user.userId, conversationId.data);
  if (!viewer) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  const [message] = await db.select({ id: messages.id, senderId: messages.senderId }).from(messages).where(and(eq(messages.id, messageId.data), eq(messages.conversationId, conversationId.data))).limit(1);
  if (!message) return void res.status(404).json({ success: false, message: "Message not found." });
  if (message.senderId !== viewer) return void res.status(403).json({ success: false, message: "Only the sender can inspect this message's read receipts." });
  const readers = await db.select({ readerId: messageReads.readerId, read: messageReads.read, readAt: messageReads.readAt, delivered: messageReads.delivered, deliveredAt: messageReads.deliveredAt, readHidden: messageReads.readHidden }).from(messageReads).where(eq(messageReads.messageId, message.id));
  res.json({ success: true, messageId: message.id, receipts: readers.filter((receipt) => !receipt.readHidden) });
});

export default router;
