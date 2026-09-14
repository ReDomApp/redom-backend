import { Router } from "express";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { db, pool } from "../database/db";
import { conversations } from "../database/conversations";
import { conversationParticipants } from "../database/conversationParticipants";
import { messages } from "../database/messages";
import { messageAttachments } from "../database/messageAttachments";
import { userProfiles } from "../database/userProfiles";
import { blockedUsers } from "../database/blockedUsers";
import { reports } from "../database/reports";
import { activityLog } from "../database/activityLog";

const router = Router();
router.use(authMiddleware, authRateLimit);

async function profileIdFor(userId: string) {
  const [profile] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return profile?.id ?? null;
}

async function memberFor(conversationId: string, profileId: string) {
  const [member] = await db.select().from(conversationParticipants).where(and(
    eq(conversationParticipants.conversationId, conversationId),
    eq(conversationParticipants.userId, profileId),
    eq(conversationParticipants.activeMember, true),
    eq(conversationParticipants.temporarilySuspended, false),
    eq(conversationParticipants.permanentlyRemoved, false),
  )).limit(1);
  return member ?? null;
}

async function blockedBetween(profileId: string, targetProfileId: string) {
  const [a] = await db.select({ userId: userProfiles.userId }).from(userProfiles).where(eq(userProfiles.id, profileId)).limit(1);
  const [b] = await db.select({ userId: userProfiles.userId }).from(userProfiles).where(eq(userProfiles.id, targetProfileId)).limit(1);
  if (!a || !b) return false;
  const [row] = await db.select({ id: blockedUsers.id }).from(blockedUsers).where(sql`(
    (${blockedUsers.userId} = ${a.userId} AND ${blockedUsers.blockedUserId} = ${b.userId}) OR
    (${blockedUsers.userId} = ${b.userId} AND ${blockedUsers.blockedUserId} = ${a.userId})
  )`).limit(1);
  return Boolean(row);
}

// Canonical conversation reader. The E2EE route is intentionally authoritative for
// exact /conversations/:conversationId/messages writes; this endpoint handles the
// lifecycle-aware read path and never substitutes plaintext for encrypted content.
router.get("/conversations/:conversationId", async (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.conversationId);
  if (!req.user?.userId || !parsed.success) return void res.status(400).json({ success: false, message: "A valid conversation is required." });
  const profileId = await profileIdFor(req.user.userId);
  if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });
  if (!await memberFor(parsed.data, profileId)) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });

  await pool.query(`UPDATE messages m SET deleted_for_everyone = true, deleted_placeholder = true, deleted_at = now(), message = NULL, caption = NULL
    WHERE m.conversation_id = $1 AND m.deleted_for_everyone = false
      AND EXISTS (SELECT 1 FROM message_lifecycle ml WHERE ml.message_id = m.id AND ml.expires_at IS NOT NULL AND ml.expires_at <= now() AND ml.kept = false)`, [parsed.data]);

  const rows = await db.select().from(messages).where(eq(messages.conversationId, parsed.data)).orderBy(messages.createdAt).limit(300);
  const ids = rows.map((r) => r.id);
  const attachmentRows = ids.length ? await db.select().from(messageAttachments).where(and(inArray(messageAttachments.messageId, ids), eq(messageAttachments.active, true), eq(messageAttachments.deleted, false))) : [];
  const lifecycle = ids.length ? await pool.query(`SELECT message_id, view_once, opened_at, expires_at, kept FROM message_lifecycle WHERE message_id = ANY($1::uuid[])`, [ids]) : { rows: [] as any[] };
  const lifecycleMap = new Map(lifecycle.rows.map((r) => [r.message_id, r]));
  const attachmentMap = new Map<string, typeof attachmentRows[number]>();
  for (const attachment of attachmentRows) attachmentMap.set(attachment.messageId, attachment);
  const visible = rows.filter((row) => !row.deletedForEveryone || row.deletedPlaceholder).map((row) => {
    const life = lifecycleMap.get(row.id);
    const isViewOnce = Boolean(life?.view_once);
    const opened = Boolean(life?.opened_at);
    const safeRow = row.deletedForEveryone ? { ...row, message: null, caption: null, hyperlink: null, richLinkPreview: false, deletedPlaceholder: true } : row;
    return { ...safeRow, attachment: isViewOnce && opened ? null : (attachmentMap.get(row.id) ?? null), lifecycle: { viewOnce: isViewOnce, opened, expiresAt: life?.expires_at ?? null, kept: Boolean(life?.kept) } };
  });
  const parentIds = [...new Set(visible.map((row) => row.parentMessageId).filter((v): v is string => Boolean(v)))];
  const parentRows = parentIds.length ? await db.select({ id: messages.id, message: messages.message, senderId: messages.senderId, deletedForEveryone: messages.deletedForEveryone, deletedPlaceholder: messages.deletedPlaceholder, encryptedPayload: messages.encryptedPayload }).from(messages).where(inArray(messages.id, parentIds)) : [];
  res.json({ success: true, messages: visible, replyTargets: parentRows });
});

router.get("/conversations/:conversationId/policy", async (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.conversationId);
  if (!req.user?.userId || !parsed.success) return void res.status(400).json({ success: false, message: "A valid conversation is required." });
  const profileId = await profileIdFor(req.user.userId);
  if (!profileId || !await memberFor(parsed.data, profileId)) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  const result = await pool.query("SELECT timer_seconds FROM conversation_message_policies WHERE conversation_id = $1", [parsed.data]);
  res.json({ success: true, timerSeconds: result.rows[0]?.timer_seconds ?? 0, allowedTimers: [0, 86400, 604800, 7776000] });
});

router.patch("/conversations/:conversationId/policy", async (req, res) => {
  const conversationId = z.string().uuid().safeParse(req.params.conversationId);
  const body = z.object({ timerSeconds: z.union([z.literal(0), z.literal(86400), z.literal(604800), z.literal(7776000)]) }).strict().safeParse(req.body);
  if (!req.user?.userId || !conversationId.success || !body.success) return void res.status(400).json({ success: false, message: "Invalid disappearing-message policy." });
  const profileId = await profileIdFor(req.user.userId);
  if (!profileId || !await memberFor(conversationId.data, profileId)) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  await pool.query(`INSERT INTO conversation_message_policies(conversation_id, timer_seconds, updated_by, updated_at)
    VALUES ($1,$2,$3,now()) ON CONFLICT (conversation_id) DO UPDATE SET timer_seconds=EXCLUDED.timer_seconds, updated_by=EXCLUDED.updated_by, updated_at=now()`, [conversationId.data, body.data.timerSeconds, profileId]);
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "message_policy_updated", activityCategory: "messages", activityTitle: "Disappearing messages setting changed", activityDescription: `Message timer changed to ${body.data.timerSeconds} seconds.`, targetId: conversationId.data, targetType: "conversation", targetUrl: `redom://messages/${conversationId.data}`, status: "success", triggeredBy: "user", source: "app", undoSupported: false, hidden: false, archived: false });
  res.json({ success: true, timerSeconds: body.data.timerSeconds });
});

router.post("/conversations/:conversationId/typing", async (req, res) => {
  const conversationId = z.string().uuid().safeParse(req.params.conversationId);
  const body = z.object({ typing: z.boolean() }).strict().safeParse(req.body);
  if (!req.user?.userId || !conversationId.success || !body.success) return void res.status(400).json({ success: false, message: "Invalid typing state." });
  const profileId = await profileIdFor(req.user.userId);
  if (!profileId || !await memberFor(conversationId.data, profileId)) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  await db.update(conversationParticipants).set({ isTyping: body.data.typing, typingStartedAt: body.data.typing ? new Date() : null, updatedAt: new Date() }).where(and(eq(conversationParticipants.conversationId, conversationId.data), eq(conversationParticipants.userId, profileId)));
  res.json({ success: true });
});

router.get("/conversations/:conversationId/typing", async (req, res) => {
  const conversationId = z.string().uuid().safeParse(req.params.conversationId);
  if (!req.user?.userId || !conversationId.success) return void res.status(400).json({ success: false, message: "Invalid conversation." });
  const profileId = await profileIdFor(req.user.userId);
  if (!profileId || !await memberFor(conversationId.data, profileId)) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  const rows = await db.select({ userId: conversationParticipants.userId, isTyping: conversationParticipants.isTyping, typingStartedAt: conversationParticipants.typingStartedAt }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, conversationId.data), eq(conversationParticipants.activeMember, true), ne(conversationParticipants.userId, profileId), eq(conversationParticipants.isTyping, true)));
  res.json({ success: true, typing: rows });
});

router.post("/messages/:messageId/view-once", async (req, res) => {
  const messageId = z.string().uuid().safeParse(req.params.messageId);
  if (!req.user?.userId || !messageId.success) return void res.status(400).json({ success: false, message: "Invalid message." });
  const profileId = await profileIdFor(req.user.userId);
  const [message] = await db.select().from(messages).where(eq(messages.id, messageId.data)).limit(1);
  if (!profileId || !message || !await memberFor(message.conversationId, profileId)) return void res.status(403).json({ success: false, message: "You do not have access to this message." });
  if (!["photo", "video", "voice"].includes(message.messageType)) return void res.status(400).json({ success: false, message: "View once is supported for photos, videos, and voice messages." });
  await pool.query(`INSERT INTO message_lifecycle(message_id, conversation_id, view_once) VALUES ($1,$2,true)
    ON CONFLICT(message_id) DO UPDATE SET view_once=true, opened_at=NULL, expires_at=COALESCE(message_lifecycle.expires_at, now() + interval '14 days')`, [message.id, message.conversationId]);
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "message_view_once_enabled", activityCategory: "messages", activityTitle: "View Once enabled", activityDescription: "A media message was marked View Once.", targetId: message.id, targetType: "message", targetUrl: `redom://messages/${message.conversationId}`, status: "success", triggeredBy: "user", source: "app", undoSupported: false, hidden: false, archived: false });
  res.json({ success: true, messageId: message.id, viewOnce: true });
});

router.post("/messages/:messageId/open-view-once", async (req, res) => {
  const messageId = z.string().uuid().safeParse(req.params.messageId);
  if (!req.user?.userId || !messageId.success) return void res.status(400).json({ success: false, message: "Invalid message." });
  const profileId = await profileIdFor(req.user.userId);
  const [message] = await db.select().from(messages).where(eq(messages.id, messageId.data)).limit(1);
  if (!profileId || !message || !await memberFor(message.conversationId, profileId)) return void res.status(403).json({ success: false, message: "You do not have access to this message." });
  const life = await pool.query("SELECT view_once, opened_at, expires_at FROM message_lifecycle WHERE message_id=$1", [message.id]);
  if (!life.rows[0]?.view_once) return void res.status(400).json({ success: false, message: "This message is not view once." });
  if (life.rows[0].expires_at && new Date(life.rows[0].expires_at).getTime() <= Date.now()) return void res.status(410).json({ success: false, message: "This view once message has expired." });
  if (life.rows[0].opened_at) return void res.status(410).json({ success: false, message: "This view once message has already been opened." });
  if (message.senderId === profileId) return void res.status(403).json({ success: false, message: "View Once media can only be opened by a recipient." });
  const attachment = await db.select().from(messageAttachments).where(and(eq(messageAttachments.messageId, message.id), eq(messageAttachments.active, true), eq(messageAttachments.deleted, false))).limit(1);
  const opened = await pool.query("UPDATE message_lifecycle SET opened_at=now() WHERE message_id=$1 AND opened_at IS NULL RETURNING opened_at", [message.id]);
  if (!opened.rows[0]) return void res.status(410).json({ success: false, message: "This view once message has already been opened." });
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "message_view_once_opened", activityCategory: "messages", activityTitle: "View Once opened", activityDescription: "A recipient opened View Once media.", targetId: message.id, targetType: "message", targetUrl: `redom://messages/${message.conversationId}`, status: "success", triggeredBy: "user", source: "app", undoSupported: false, hidden: false, archived: false });
  res.json({ success: true, message: { ...message, attachment: attachment[0] ?? null }, openedAt: opened.rows[0].opened_at });
});

router.post("/messages/:messageId/report", async (req, res) => {
  const messageId = z.string().uuid().safeParse(req.params.messageId);
  const body = z.object({ reason: z.string().min(2).max(60), details: z.string().max(2000).optional(), blockSender: z.boolean().optional() }).strict().safeParse(req.body);
  if (!req.user?.userId || !messageId.success || !body.success) return void res.status(400).json({ success: false, message: "A valid report is required." });
  const reporter = await profileIdFor(req.user.userId);
  const [message] = await db.select().from(messages).where(eq(messages.id, messageId.data)).limit(1);
  if (!reporter || !message || !await memberFor(message.conversationId, reporter)) return void res.status(403).json({ success: false, message: "You cannot report this message." });
  await db.insert(reports).values({ reporterUserId: reporter, reportedUserId: message.senderId, reportTarget: "message", targetId: message.id, reportReason: body.data.reason, additionalDetails: body.data.details ?? null, requiresHumanReview: true, moderatorAction: "pending", status: "open", priority: "normal" });
  await db.update(messages).set({ reportCount: sql`${messages.reportCount} + 1` }).where(eq(messages.id, message.id));
  if (body.data.blockSender && message.senderId !== reporter) {
    const [from] = await db.select({ userId: userProfiles.userId }).from(userProfiles).where(eq(userProfiles.id, reporter)).limit(1);
    const [to] = await db.select({ userId: userProfiles.userId }).from(userProfiles).where(eq(userProfiles.id, message.senderId)).limit(1);
    if (from && to) await db.insert(blockedUsers).values({ userId: from.userId, blockedUserId: to.userId, reason: body.data.reason.slice(0, 50) }).onConflictDoNothing();
  }
  res.status(201).json({ success: true, reported: true, blocked: Boolean(body.data.blockSender) });
});

router.post("/block/:profileId", async (req, res) => {
  const target = z.string().uuid().safeParse(req.params.profileId);
  if (!req.user?.userId || !target.success) return void res.status(400).json({ success: false, message: "Invalid profile." });
  const [me] = await db.select({ userId: userProfiles.userId }).from(userProfiles).where(eq(userProfiles.userId, req.user.userId)).limit(1);
  const [them] = await db.select({ userId: userProfiles.userId }).from(userProfiles).where(eq(userProfiles.id, target.data)).limit(1);
  if (!me || !them || me.userId === them.userId) return void res.status(400).json({ success: false, message: "A different user is required." });
  await db.insert(blockedUsers).values({ userId: me.userId, blockedUserId: them.userId, reason: "messages" }).onConflictDoNothing();
  res.json({ success: true, blocked: true });
});

router.delete("/block/:profileId", async (req, res) => {
  const target = z.string().uuid().safeParse(req.params.profileId);
  if (!req.user?.userId || !target.success) return void res.status(400).json({ success: false, message: "Invalid profile." });
  const [them] = await db.select({ userId: userProfiles.userId }).from(userProfiles).where(eq(userProfiles.id, target.data)).limit(1);
  if (!them) return void res.status(404).json({ success: false, message: "Profile not found." });
  await db.delete(blockedUsers).where(and(eq(blockedUsers.userId, req.user.userId), eq(blockedUsers.blockedUserId, them.userId)));
  res.json({ success: true, blocked: false });
});

router.get("/block/:profileId/status", async (req, res) => {
  const target = z.string().uuid().safeParse(req.params.profileId);
  if (!req.user?.userId || !target.success) return void res.status(400).json({ success: false, message: "Invalid profile." });
  const [them] = await db.select({ userId: userProfiles.userId }).from(userProfiles).where(eq(userProfiles.id, target.data)).limit(1);
  if (!them) return void res.status(404).json({ success: false, message: "Profile not found." });
  const [row] = await db.select({ id: blockedUsers.id }).from(blockedUsers).where(and(eq(blockedUsers.userId, req.user.userId), eq(blockedUsers.blockedUserId, them.userId))).limit(1);
  res.json({ success: true, blocked: Boolean(row) });
});

export default router;
