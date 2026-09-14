import { Router } from "express";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { db } from "../database/db";
import { conversations } from "../database/conversations";
import { conversationParticipants } from "../database/conversationParticipants";
import { messages } from "../database/messages";
import { messageDeletions } from "../database/messageDeletions";
import { notifications } from "../database/notifications";
import { activityLog } from "../database/activityLog";
import { userProfiles } from "../database/userProfiles";

const router = Router();
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const DELETE_EVERYONE_WINDOW_MS = 48 * 60 * 60 * 1000;

async function currentProfileUuid(userId: string) {
  const [profile] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return profile?.id ?? null;
}

async function requireMember(userId: string, conversationId: string) {
  const profileId = await currentProfileUuid(userId);
  if (!profileId) return { profileId: null, member: null };
  const [member] = await db.select().from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, profileId), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.temporarilySuspended, false), eq(conversationParticipants.permanentlyRemoved, false))).limit(1);
  return { profileId, member: member ?? null };
}

router.get("/conversations", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.userId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const profileId = await currentProfileUuid(req.user.userId);
  if (!profileId) { res.status(404).json({ success: false, message: "Profile not found." }); return; }
  const memberships = await db.select({ conversationId: conversationParticipants.conversationId, unreadMessageCount: conversationParticipants.unreadMessageCount, muted: conversationParticipants.muted, pinned: conversationParticipants.pinned, archived: conversationParticipants.archived, notificationsEnabled: conversationParticipants.notificationsEnabled, mentionsOnly: conversationParticipants.mentionsOnly }).from(conversationParticipants).where(and(eq(conversationParticipants.userId, profileId), eq(conversationParticipants.activeMember, true)));
  const ids = memberships.map((m) => m.conversationId);
  if (!ids.length) { res.json({ success: true, conversations: [] }); return; }
  const rows = await db.select({ id: conversations.id, type: conversations.conversationType, groupName: conversations.groupName, updatedAt: conversations.updatedAt, messageCount: conversations.messageCount }).from(conversations).where(and(inArray(conversations.id, ids), eq(conversations.deleted, false))).orderBy(desc(conversations.updatedAt));
  const latest = await Promise.all(rows.map(async (c) => {
    const [last] = await db.select({ id: messages.id, message: messages.message, messageType: messages.messageType, senderId: messages.senderId, createdAt: messages.createdAt, deletedPlaceholder: messages.deletedPlaceholder, edited: messages.edited }).from(messages).where(eq(messages.conversationId, c.id)).orderBy(desc(messages.createdAt)).limit(1);
    const membership = memberships.find((m) => m.conversationId === c.id);
    return { ...c, unreadMessageCount: membership?.unreadMessageCount ?? 0, muted: membership?.muted ?? false, pinned: membership?.pinned ?? false, archived: membership?.archived ?? false, notificationsEnabled: membership?.notificationsEnabled ?? true, mentionsOnly: membership?.mentionsOnly ?? false, lastMessage: last ?? null };
  }));
  res.json({ success: true, conversations: latest });
});

router.get("/conversations/:conversationId", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.userId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const id = z.string().uuid().safeParse(req.params.conversationId);
  if (!id.success) { res.status(400).json({ success: false, message: "Invalid conversation id." }); return; }
  const { profileId, member } = await requireMember(req.user.userId, id.data);
  if (!profileId) { res.status(404).json({ success: false, message: "Profile not found." }); return; }
  if (!member) { res.status(403).json({ success: false, message: "You do not have access to this conversation." }); return; }
  const rows = await db.select().from(messages).where(and(eq(messages.conversationId, id.data), eq(messages.deletedForEveryone, false))).orderBy(messages.createdAt).limit(200);
  const visibleIds = rows.length ? (await db.select({ messageId: messageDeletions.messageId }).from(messageDeletions).where(and(eq(messageDeletions.userId, profileId), inArray(messageDeletions.messageId, rows.map((r) => r.id))))).map((r) => r.messageId) : [];
  const visible = rows.filter((row) => !visibleIds.includes(row.id));
  const parentIds = [...new Set(visible.map((row) => row.parentMessageId).filter((v): v is string => Boolean(v)))];
  const parentRows = parentIds.length ? await db.select({ id: messages.id, message: messages.message, senderId: messages.senderId, deletedForEveryone: messages.deletedForEveryone, deletedPlaceholder: messages.deletedPlaceholder }).from(messages).where(inArray(messages.id, parentIds)) : [];
  res.json({ success: true, messages: visible, replyTargets: parentRows });
});

router.get("/conversations/:conversationId/settings", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.userId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const id = z.string().uuid().safeParse(req.params.conversationId);
  if (!id.success) { res.status(400).json({ success: false, message: "Invalid conversation id." }); return; }
  const { profileId, member } = await requireMember(req.user.userId, id.data);
  if (!profileId) { res.status(404).json({ success: false, message: "Profile not found." }); return; }
  if (!member) { res.status(403).json({ success: false, message: "You do not have access to this conversation." }); return; }
  res.json({ success: true, settings: { muted: member.muted, pinned: member.pinned, archived: member.archived, notificationsEnabled: member.notificationsEnabled, mentionsOnly: member.mentionsOnly, customNotificationSound: member.customNotificationSound, appWallpaper: member.appWallpaper, canJoinCalls: member.canJoinCalls } });
});

router.patch("/conversations/:conversationId/settings", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.userId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const id = z.string().uuid().safeParse(req.params.conversationId);
  const parsed = z.object({ muted: z.boolean().optional(), pinned: z.boolean().optional(), archived: z.boolean().optional(), notificationsEnabled: z.boolean().optional(), mentionsOnly: z.boolean().optional(), customNotificationSound: z.string().max(255).nullable().optional(), appWallpaper: z.string().max(255).nullable().optional() }).strict().safeParse(req.body);
  if (!id.success || !parsed.success || !Object.keys(parsed.data).length) { res.status(400).json({ success: false, message: "No valid conversation setting was supplied." }); return; }
  const { profileId, member } = await requireMember(req.user.userId, id.data);
  if (!profileId) { res.status(404).json({ success: false, message: "Profile not found." }); return; }
  if (!member) { res.status(403).json({ success: false, message: "You do not have access to this conversation." }); return; }
  await db.update(conversationParticipants).set({ ...parsed.data, updatedAt: new Date() }).where(eq(conversationParticipants.id, member.id));
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "conversation_settings_updated", activityCategory: "messages", activityTitle: "Conversation settings updated", activityDescription: "A ReDom conversation setting was changed.", targetId: id.data, targetType: "conversation", targetUrl: `redom://messages/${id.data}`, status: "success", triggeredBy: "user", source: "app", undoSupported: true, hidden: false, archived: false });
  res.json({ success: true, settings: { ...member, ...parsed.data } });
});

router.post("/conversations/direct", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.userId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const profileId = await currentProfileUuid(req.user.userId);
  const parsed = z.object({ recipientProfileId: z.string().uuid() }).safeParse(req.body);
  if (!profileId) { res.status(404).json({ success: false, message: "Profile not found." }); return; }
  if (!parsed.success || parsed.data.recipientProfileId === profileId) { res.status(400).json({ success: false, message: "A different recipient is required." }); return; }
  const mine = await db.select({ conversationId: conversationParticipants.conversationId }).from(conversationParticipants).where(and(eq(conversationParticipants.userId, profileId), eq(conversationParticipants.activeMember, true)));
  for (const row of mine) {
    const [other] = await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, row.conversationId), eq(conversationParticipants.userId, parsed.data.recipientProfileId), eq(conversationParticipants.activeMember, true))).limit(1);
    if (other) { res.json({ success: true, conversationId: row.conversationId, existing: true }); return; }
  }
  const [conversation] = await db.insert(conversations).values({ createdBy: profileId, conversationType: "direct", encrypted: true, aiModerationEnabled: true }).returning({ id: conversations.id });
  if (!conversation) { res.status(500).json({ success: false, message: "Unable to create conversation." }); return; }
  await db.insert(conversationParticipants).values([
    { conversationId: conversation.id, userId: profileId, joinedByCreator: true, role: "owner", joinRequestApproved: true },
    { conversationId: conversation.id, userId: parsed.data.recipientProfileId, joinedBy: profileId, role: "member", joinRequestApproved: true },
  ]);
  await db.update(conversations).set({ participantCount: 2, updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "conversation_created", activityCategory: "messages", activityTitle: "Conversation created", activityDescription: "A direct ReDom conversation was created.", targetId: conversation.id, targetType: "conversation", targetUrl: `redom://messages/${conversation.id}`, status: "success", triggeredBy: "user", source: "app", undoSupported: false, hidden: false, archived: false });
  res.status(201).json({ success: true, conversationId: conversation.id, existing: false });
});

router.post("/conversations/:conversationId/messages", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.userId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const id = z.string().uuid().safeParse(req.params.conversationId);
  const parsed = z.object({ message: z.string().trim().min(1).max(10000), parentMessageId: z.string().uuid().optional() }).safeParse(req.body);
  if (!id.success || !parsed.success) { res.status(400).json({ success: false, message: "A valid conversation and message are required." }); return; }
  const { profileId, member } = await requireMember(req.user.userId, id.data);
  if (!profileId) { res.status(404).json({ success: false, message: "Profile not found." }); return; }
  if (!member) { res.status(403).json({ success: false, message: "You cannot send messages in this conversation." }); return; }
  const [conversation] = await db.select().from(conversations).where(and(eq(conversations.id, id.data), eq(conversations.deleted, false), eq(conversations.locked, false), eq(conversations.status, "active"))).limit(1);
  if (!conversation) { res.status(403).json({ success: false, message: "This conversation is unavailable." }); return; }
  if (parsed.data.parentMessageId) {
    const [parent] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.id, parsed.data.parentMessageId), eq(messages.conversationId, id.data), eq(messages.deletedForEveryone, false))).limit(1);
    if (!parent) { res.status(400).json({ success: false, message: "The message you are replying to is unavailable." }); return; }
  }
  const [created] = await db.insert(messages).values({ conversationId: id.data, senderId: profileId, parentMessageId: parsed.data.parentMessageId, messageType: "text", message: parsed.data.message, sent: true, delivered: false, read: false, aiReviewed: false, moderationStatus: "approved" }).returning();
  if (!created) { res.status(500).json({ success: false, message: "Unable to persist message." }); return; }
  await db.update(conversations).set({ messageCount: sql`${conversations.messageCount} + 1`, updatedAt: new Date() }).where(eq(conversations.id, id.data));
  const recipients = await db.select({ userId: conversationParticipants.userId, notificationsEnabled: conversationParticipants.notificationsEnabled, muted: conversationParticipants.muted, mentionsOnly: conversationParticipants.mentionsOnly }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.activeMember, true), ne(conversationParticipants.userId, profileId)));
  for (const recipient of recipients) {
    await db.update(conversationParticipants).set({ unreadMessageCount: sql`${conversationParticipants.unreadMessageCount} + 1` }).where(and(eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.userId, recipient.userId)));
    if (recipient.notificationsEnabled && !recipient.muted) {
      await db.insert(notifications).values({ recipientUserId: recipient.userId, actorUserId: profileId, messageId: created.id, conversationId: id.data, notificationType: "message", title: "New message", body: recipient.mentionsOnly ? "You have a new ReDom message." : parsed.data.message.slice(0, 200), actionUrl: `redom://messages/${id.data}`, unread: true, read: false, inAppDelivered: true, priority: "normal" });
    }
  }
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: parsed.data.parentMessageId ? "message_reply_sent" : "message_sent", activityCategory: "messages", activityTitle: parsed.data.parentMessageId ? "Message reply sent" : "Message sent", activityDescription: parsed.data.parentMessageId ? "A ReDom reply was sent." : "A ReDom message was sent.", targetId: created.id, targetType: "message", targetUrl: `redom://messages/${id.data}`, status: "success", triggeredBy: "user", source: "app", undoSupported: true, hidden: false, archived: false });
  res.status(201).json({ success: true, message: created });
});

router.patch("/conversations/:conversationId/messages/:messageId", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.userId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const conversationId = z.string().uuid().safeParse(req.params.conversationId);
  const messageId = z.string().uuid().safeParse(req.params.messageId);
  const parsed = z.object({ message: z.string().trim().min(1).max(10000) }).strict().safeParse(req.body);
  if (!conversationId.success || !messageId.success || !parsed.success) { res.status(400).json({ success: false, message: "A valid message is required." }); return; }
  const { profileId, member } = await requireMember(req.user.userId, conversationId.data);
  if (!profileId) { res.status(404).json({ success: false, message: "Profile not found." }); return; }
  if (!member) { res.status(403).json({ success: false, message: "You do not have access to this conversation." }); return; }
  const [existing] = await db.select().from(messages).where(and(eq(messages.id, messageId.data), eq(messages.conversationId, conversationId.data))).limit(1);
  if (!existing) { res.status(404).json({ success: false, message: "Message not found." }); return; }
  if (existing.senderId !== profileId) { res.status(403).json({ success: false, message: "Only the message sender can edit this message." }); return; }
  if (existing.deletedForEveryone || existing.deletedPlaceholder) { res.status(409).json({ success: false, message: "Deleted messages cannot be edited." }); return; }
  if (existing.messageType !== "text") { res.status(400).json({ success: false, message: "Only text messages can be edited." }); return; }
  if (Date.now() - existing.createdAt.getTime() > EDIT_WINDOW_MS) { res.status(409).json({ success: false, message: "Messages can only be edited within 15 minutes of sending." }); return; }
  const [updated] = await db.update(messages).set({ message: parsed.data.message, edited: true, editedLabel: true, editedAt: new Date(), updatedAt: new Date() }).where(eq(messages.id, existing.id)).returning();
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "message_edited", activityCategory: "messages", activityTitle: "Message edited", activityDescription: "A ReDom text message was edited.", targetId: existing.id, targetType: "message", targetUrl: `redom://messages/${conversationId.data}`, status: "success", triggeredBy: "user", source: "app", undoSupported: false, hidden: false, archived: false });
  res.json({ success: true, message: updated });
});

router.delete("/conversations/:conversationId/messages/:messageId", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.userId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const conversationId = z.string().uuid().safeParse(req.params.conversationId);
  const messageId = z.string().uuid().safeParse(req.params.messageId);
  const parsed = z.object({ scope: z.enum(["me", "everyone"]) }).strict().safeParse(req.body);
  if (!conversationId.success || !messageId.success || !parsed.success) { res.status(400).json({ success: false, message: "Choose Delete for me or Delete for everyone." }); return; }
  const { profileId, member } = await requireMember(req.user.userId, conversationId.data);
  if (!profileId) { res.status(404).json({ success: false, message: "Profile not found." }); return; }
  if (!member) { res.status(403).json({ success: false, message: "You do not have access to this conversation." }); return; }
  const [existing] = await db.select().from(messages).where(and(eq(messages.id, messageId.data), eq(messages.conversationId, conversationId.data))).limit(1);
  if (!existing) { res.status(404).json({ success: false, message: "Message not found." }); return; }
  if (existing.deletedForEveryone) { res.status(409).json({ success: false, message: "This message was already deleted for everyone." }); return; }
  if (parsed.data.scope === "me") {
    await db.insert(messageDeletions).values({ messageId: existing.id, userId: profileId }).onConflictDoNothing();
    await db.insert(activityLog).values({ userId: req.user.userId, activityType: "message_deleted_for_me", activityCategory: "messages", activityTitle: "Message deleted for me", activityDescription: "A ReDom message was removed from this user's view.", targetId: existing.id, targetType: "message", targetUrl: `redom://messages/${conversationId.data}`, status: "success", triggeredBy: "user", source: "app", undoSupported: false, hidden: false, archived: false });
    res.json({ success: true, scope: "me", messageId: existing.id });
    return;
  }
  if (existing.senderId !== profileId) { res.status(403).json({ success: false, message: "Only the message sender can delete this message for everyone." }); return; }
  if (Date.now() - existing.createdAt.getTime() > DELETE_EVERYONE_WINDOW_MS) { res.status(409).json({ success: false, message: "Messages can only be deleted for everyone within 48 hours of sending." }); return; }
  await db.update(messages).set({ message: null, caption: null, deletedForEveryone: true, deletedPlaceholder: true, deletedAt: new Date(), edited: false, editedLabel: false, updatedAt: new Date() }).where(eq(messages.id, existing.id));
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "message_deleted_for_everyone", activityCategory: "messages", activityTitle: "Message deleted for everyone", activityDescription: "A ReDom message was deleted for everyone in the conversation.", targetId: existing.id, targetType: "message", targetUrl: `redom://messages/${conversationId.data}`, status: "success", triggeredBy: "user", source: "app", undoSupported: false, hidden: false, archived: false });
  res.json({ success: true, scope: "everyone", messageId: existing.id, placeholder: "This message was deleted" });
});

router.post("/conversations/:conversationId/read", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.userId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const id = z.string().uuid().safeParse(req.params.conversationId);
  if (!id.success) { res.status(400).json({ success: false, message: "Invalid conversation id." }); return; }
  const { profileId, member } = await requireMember(req.user.userId, id.data);
  if (!profileId) { res.status(404).json({ success: false, message: "Profile not found." }); return; }
  if (!member) { res.status(403).json({ success: false, message: "You do not have access to this conversation." }); return; }
  await db.update(conversationParticipants).set({ unreadMessageCount: 0, updatedAt: new Date() }).where(eq(conversationParticipants.id, member.id));
  await db.update(messages).set({ read: true, delivered: true, readAt: new Date(), updatedAt: new Date() }).where(and(eq(messages.conversationId, id.data), eq(messages.read, false), ne(messages.senderId, profileId)));
  res.json({ success: true });
});

export default router;
