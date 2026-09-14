import { Router } from "express";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { db } from "../database/db";
import { conversations } from "../database/conversations";
import { conversationParticipants } from "../database/conversationParticipants";
import { messages } from "../database/messages";
import { notifications } from "../database/notifications";
import { activityLog } from "../database/activityLog";

const router = Router();

router.get("/conversations", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.profileId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const memberships = await db.select({ conversationId: conversationParticipants.conversationId, unreadMessageCount: conversationParticipants.unreadMessageCount, muted: conversationParticipants.muted, pinned: conversationParticipants.pinned, archived: conversationParticipants.archived })
    .from(conversationParticipants)
    .where(and(eq(conversationParticipants.userId, req.user.profileId), eq(conversationParticipants.activeMember, true)));
  const ids = memberships.map((m) => m.conversationId);
  if (!ids.length) { res.json({ success: true, conversations: [] }); return; }
  const rows = await db.select({ id: conversations.id, type: conversations.conversationType, groupName: conversations.groupName, updatedAt: conversations.updatedAt, messageCount: conversations.messageCount })
    .from(conversations).where(and(inArray(conversations.id, ids), eq(conversations.deleted, false))).orderBy(desc(conversations.updatedAt));
  const latest = await Promise.all(rows.map(async (c) => {
    const [last] = await db.select({ id: messages.id, message: messages.message, messageType: messages.messageType, senderId: messages.senderId, createdAt: messages.createdAt })
      .from(messages).where(and(eq(messages.conversationId, c.id), eq(messages.deletedForEveryone, false))).orderBy(desc(messages.createdAt)).limit(1);
    const membership = memberships.find((m) => m.conversationId === c.id);
    return { ...c, unreadMessageCount: membership?.unreadMessageCount ?? 0, muted: membership?.muted ?? false, pinned: membership?.pinned ?? false, archived: membership?.archived ?? false, lastMessage: last ?? null };
  }));
  res.json({ success: true, conversations: latest });
});

router.get("/conversations/:conversationId", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.profileId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const id = z.string().uuid().safeParse(req.params.conversationId);
  if (!id.success) { res.status(400).json({ success: false, message: "Invalid conversation id." }); return; }
  const [member] = await db.select().from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.userId, req.user.profileId), eq(conversationParticipants.activeMember, true))).limit(1);
  if (!member) { res.status(403).json({ success: false, message: "You do not have access to this conversation." }); return; }
  const rows = await db.select().from(messages).where(and(eq(messages.conversationId, id.data), eq(messages.deletedForEveryone, false))).orderBy(messages.createdAt).limit(200);
  res.json({ success: true, messages: rows });
});

router.post("/conversations/direct", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.profileId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const parsed = z.object({ recipientProfileId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success || parsed.data.recipientProfileId === req.user.profileId) { res.status(400).json({ success: false, message: "A different recipient is required." }); return; }
  const mine = await db.select({ conversationId: conversationParticipants.conversationId }).from(conversationParticipants).where(and(eq(conversationParticipants.userId, req.user.profileId), eq(conversationParticipants.activeMember, true)));
  for (const row of mine) {
    const [other] = await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, row.conversationId), eq(conversationParticipants.userId, parsed.data.recipientProfileId), eq(conversationParticipants.activeMember, true))).limit(1);
    if (other) { res.json({ success: true, conversationId: row.conversationId, existing: true }); return; }
  }
  const [conversation] = await db.insert(conversations).values({ createdBy: req.user.profileId, conversationType: "direct", encrypted: true, aiModerationEnabled: true }).returning({ id: conversations.id });
  await db.insert(conversationParticipants).values([
    { conversationId: conversation.id, userId: req.user.profileId, joinedByCreator: true, role: "owner", joinRequestApproved: true },
    { conversationId: conversation.id, userId: parsed.data.recipientProfileId, joinedBy: req.user.profileId, role: "member", joinRequestApproved: true },
  ]);
  await db.update(conversations).set({ participantCount: 2, updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "conversation_created", activityCategory: "messages", activityTitle: "Conversation created", activityDescription: "A direct ReDom conversation was created.", targetId: conversation.id, targetType: "conversation", targetUrl: `redom://messages/${conversation.id}`, status: "success", triggeredBy: "user", source: "app", undoSupported: false, hidden: false, archived: false });
  res.status(201).json({ success: true, conversationId: conversation.id, existing: false });
});

router.post("/conversations/:conversationId/messages", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.profileId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const id = z.string().uuid().safeParse(req.params.conversationId);
  const parsed = z.object({ message: z.string().trim().min(1).max(10000), parentMessageId: z.string().uuid().optional() }).safeParse(req.body);
  if (!id.success || !parsed.success) { res.status(400).json({ success: false, message: "A valid conversation and message are required." }); return; }
  const [member] = await db.select().from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.userId, req.user.profileId), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.temporarilySuspended, false), eq(conversationParticipants.permanentlyRemoved, false))).limit(1);
  if (!member) { res.status(403).json({ success: false, message: "You cannot send messages in this conversation." }); return; }
  const [conversation] = await db.select().from(conversations).where(and(eq(conversations.id, id.data), eq(conversations.deleted, false), eq(conversations.locked, false), eq(conversations.status, "active"))).limit(1);
  if (!conversation) { res.status(403).json({ success: false, message: "This conversation is unavailable." }); return; }
  const [created] = await db.insert(messages).values({ conversationId: id.data, senderId: req.user.profileId, parentMessageId: parsed.data.parentMessageId, messageType: "text", message: parsed.data.message, sent: true, delivered: false, read: false, aiReviewed: false, moderationStatus: "approved" }).returning();
  await db.update(conversations).set({ messageCount: sql`${conversations.messageCount} + 1`, updatedAt: new Date() }).where(eq(conversations.id, id.data));
  const recipients = await db.select({ userId: conversationParticipants.userId }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.activeMember, true), ne(conversationParticipants.userId, req.user.profileId)));
  for (const recipient of recipients) {
    await db.insert(notifications).values({ recipientUserId: recipient.userId, actorUserId: req.user.profileId, messageId: created.id, conversationId: id.data, notificationType: "message", title: "New message", body: parsed.data.message.slice(0, 200), actionUrl: `redom://messages/${id.data}`, unread: true, read: false, inAppDelivered: true, priority: "normal" });
    await db.update(conversationParticipants).set({ unreadMessageCount: sql`${conversationParticipants.unreadMessageCount} + 1` }).where(and(eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.userId, recipient.userId)));
  }
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "message_sent", activityCategory: "messages", activityTitle: "Message sent", activityDescription: "A ReDom message was sent.", targetId: created.id, targetType: "message", targetUrl: `redom://messages/${id.data}`, status: "success", triggeredBy: "user", source: "app", undoSupported: true, hidden: false, archived: false });
  res.status(201).json({ success: true, message: created });
});

router.post("/conversations/:conversationId/read", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.profileId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const id = z.string().uuid().safeParse(req.params.conversationId);
  if (!id.success) { res.status(400).json({ success: false, message: "Invalid conversation id." }); return; }
  await db.update(conversationParticipants).set({ unreadMessageCount: 0, updatedAt: new Date() }).where(and(eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.userId, req.user.profileId)));
  await db.update(messages).set({ read: true, delivered: true, readAt: new Date(), updatedAt: new Date() }).where(and(eq(messages.conversationId, id.data), eq(messages.read, false), ne(messages.senderId, req.user.profileId)));
  res.json({ success: true });
});

export default router;
