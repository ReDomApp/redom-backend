import { Router } from "express";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { db, pool } from "../database/db";
import { conversationParticipants } from "../database/conversationParticipants";
import { conversations } from "../database/conversations";
import { messages } from "../database/messages";
import { notifications } from "../database/notifications";

const router = Router();
router.use(authMiddleware, authRateLimit);
async function profileIdFor(userId: string): Promise<string | null> { const result = await pool.query("SELECT id FROM user_profiles WHERE user_id = $1 LIMIT 1", [userId]); return result.rows[0]?.id ?? null; }
async function requireMember(userId: string, conversationId: string) {
  const profileId = await profileIdFor(userId); if (!profileId) return null;
  const [member] = await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, profileId), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.temporarilySuspended, false), eq(conversationParticipants.permanentlyRemoved, false))).limit(1);
  return member ? profileId : null;
}

router.put("/crypto/device-key", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const body = z.object({ publicKey: z.string().regex(/^[0-9a-f]{64}$/i) }).strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ success: false, message: "A valid X25519 public key is required." });
  const profileId = await profileIdFor(req.user.userId); if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });
  await pool.query(`INSERT INTO redom_device_crypto_keys(profile_id, public_key, algorithm, key_version, updated_at) VALUES ($1,$2,'X25519-AES-256-GCM',1,now()) ON CONFLICT(profile_id) DO UPDATE SET public_key=EXCLUDED.public_key, algorithm=EXCLUDED.algorithm, key_version=EXCLUDED.key_version, updated_at=now()`, [profileId, body.data.publicKey.toLowerCase()]);
  res.json({ success: true, profileId, publicKey: body.data.publicKey.toLowerCase(), algorithm: "X25519-AES-256-GCM", keyVersion: 1 });
});

router.get("/crypto/device-key/:profileId", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const profileId = z.string().uuid().safeParse(req.params.profileId); if (!profileId.success) return void res.status(400).json({ success: false, message: "Invalid profile." });
  const result = await pool.query("SELECT public_key, algorithm, key_version, updated_at FROM redom_device_crypto_keys WHERE profile_id=$1 LIMIT 1", [profileId.data]);
  if (!result.rows[0]) return void res.status(404).json({ success: false, message: "The recipient has not registered an encryption key on this device." });
  res.json({ success: true, profileId: profileId.data, publicKey: result.rows[0].public_key, algorithm: result.rows[0].algorithm, keyVersion: result.rows[0].key_version, updatedAt: result.rows[0].updated_at });
});

router.get("/crypto/conversations/:conversationId/crypto-participants", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const conversationId = z.string().uuid().safeParse(req.params.conversationId); if (!conversationId.success) return void res.status(400).json({ success: false, message: "Invalid conversation." });
  const profileId = await requireMember(req.user.userId, conversationId.data); if (!profileId) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  const result = await pool.query(`SELECT cp.user_id AS profile_id, k.public_key, k.algorithm, k.key_version FROM conversation_participants cp LEFT JOIN redom_device_crypto_keys k ON k.profile_id = cp.user_id WHERE cp.conversation_id=$1 AND cp.active_member=true AND cp.temporarily_suspended=false AND cp.permanently_removed=false`, [conversationId.data]);
  res.json({ success: true, participants: result.rows });
});

const encryptedEnvelope = z.object({ version: z.literal(1), algorithm: z.literal("X25519-AES-256-GCM"), ephemeralPublicKey: z.string().regex(/^[0-9a-f]{64}$/i), ciphertext: z.string().min(32).max(2000000) }).strict();
const encryptedPayloadSchema = z.record(z.string().uuid(), encryptedEnvelope).refine((value) => Object.keys(value).length > 0, "At least one encrypted recipient is required.");

/** Intercepts encrypted text before the legacy plaintext message endpoint. */
router.post("/conversations/:conversationId/messages", async (req, res, next) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const id = z.string().uuid().safeParse(req.params.conversationId);
  const body = z.object({ encryptedPayload: encryptedPayloadSchema, parentMessageId: z.string().uuid().optional() }).strict().safeParse(req.body);
  if (!id.success || !body.success) return next();
  const profileId = await requireMember(req.user.userId, id.data); if (!profileId) return void res.status(403).json({ success: false, message: "You cannot send messages in this conversation." });
  const [conversation] = await db.select().from(conversations).where(and(eq(conversations.id, id.data), eq(conversations.deleted, false), eq(conversations.locked, false), eq(conversations.status, "active"))).limit(1);
  if (!conversation) return void res.status(403).json({ success: false, message: "This conversation is unavailable." });
  const recipients = await db.select({ userId: conversationParticipants.userId, notificationsEnabled: conversationParticipants.notificationsEnabled, muted: conversationParticipants.muted, mentionsOnly: conversationParticipants.mentionsOnly }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.activeMember, true), ne(conversationParticipants.userId, profileId)));
  const recipientIds = new Set(recipients.map((r) => r.userId)); recipientIds.add(profileId);
  for (const key of Object.keys(body.data.encryptedPayload)) if (!recipientIds.has(key)) return void res.status(400).json({ success: false, message: "Encrypted recipient is not an active conversation participant." });
  if (body.data.parentMessageId) {
    const [parent] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.id, body.data.parentMessageId), eq(messages.conversationId, id.data), eq(messages.deletedForEveryone, false))).limit(1);
    if (!parent) return void res.status(400).json({ success: false, message: "The message you are replying to is unavailable." });
  }
  const [created] = await db.insert(messages).values({ conversationId: id.data, senderId: profileId, parentMessageId: body.data.parentMessageId, messageType: "text", message: null, sent: true, delivered: false, read: false, aiReviewed: false, moderationStatus: "approved", encryptedPayload: body.data.encryptedPayload, encryptionVersion: 1, encryptedAt: new Date() }).returning();
  if (!created) return void res.status(500).json({ success: false, message: "Unable to persist encrypted message." });
  await db.update(conversations).set({ messageCount: sql`${conversations.messageCount} + 1`, updatedAt: new Date() }).where(eq(conversations.id, id.data));
  for (const recipient of recipients) {
    await db.update(conversationParticipants).set({ unreadMessageCount: sql`${conversationParticipants.unreadMessageCount} + 1` }).where(and(eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.userId, recipient.userId)));
    if (recipient.notificationsEnabled && !recipient.muted) await db.insert(notifications).values({ recipientUserId: recipient.userId, actorUserId: profileId, messageId: created.id, conversationId: id.data, notificationType: "message", title: "New message", body: "You have a new ReDom encrypted message.", actionUrl: `redom://messages/${id.data}`, unread: true, read: false, inAppDelivered: true, priority: "normal" });
  }
  res.status(201).json({ success: true, message: created });
});

export default router;
