import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { db, pool } from "../database/db";
import { conversationParticipants } from "../database/conversationParticipants";
import { conversations } from "../database/conversations";
import { messages } from "../database/messages";
import { notifications } from "../database/notifications";

const router = Router();
router.use(authMiddleware);

async function profileIdFor(userId: string): Promise<string | null> {
  const result = await pool.query("SELECT id FROM user_profiles WHERE user_id = $1 LIMIT 1", [userId]);
  return result.rows[0]?.id ?? null;
}

async function requireMember(profileId: string, conversationId: string): Promise<boolean> {
  const [member] = await db.select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, profileId),
      eq(conversationParticipants.activeMember, true),
      eq(conversationParticipants.temporarilySuspended, false),
      eq(conversationParticipants.permanentlyRemoved, false),
    ))
    .limit(1);
  return Boolean(member);
}

async function ensureDeviceTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS redom_device_crypto_keys (device_id uuid PRIMARY KEY, profile_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE, public_key text NOT NULL, algorithm varchar(60) NOT NULL DEFAULT 'X25519-AES-256-GCM', key_version integer NOT NULL DEFAULT 1, device_label varchar(120), platform varchar(40), primary_device boolean NOT NULL DEFAULT false, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS redom_device_crypto_profile_idx ON redom_device_crypto_keys(profile_id, revoked_at);`);
}

const encryptedEnvelope = z.object({
  version: z.literal(1),
  algorithm: z.literal("X25519-AES-256-GCM"),
  ephemeralPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  ciphertext: z.string().min(32).max(2000000),
}).strict();
const encryptedPayloadSchema = z.record(z.string().uuid(), encryptedEnvelope).refine((value) => Object.keys(value).length > 0, "At least one encrypted recipient is required.");
const forwardItemSchema = z.object({
  conversationId: z.string().uuid(),
  encryptedPayload: encryptedPayloadSchema,
}).strict();
const bodySchema = z.object({
  sourceMessageId: z.string().uuid(),
  forwards: z.array(forwardItemSchema).min(1).max(5),
}).strict();

router.post("/forward", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const body = bodySchema.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ success: false, message: "A source message and between one and five destination chats are required." });
  const profileId = await profileIdFor(req.user.userId);
  if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });

  const [source] = await db.select().from(messages).where(eq(messages.id, body.data.sourceMessageId)).limit(1);
  if (!source || source.deletedForEveryone || source.deletedPlaceholder) return void res.status(409).json({ success: false, message: "This message is unavailable for forwarding." });
  if (!(await requireMember(profileId, source.conversationId))) return void res.status(403).json({ success: false, message: "You cannot forward a message from a conversation you cannot access." });

  const viewOnce = await pool.query("SELECT 1 FROM message_lifecycle WHERE message_id=$1 AND view_once=true LIMIT 1").catch(() => ({ rows: [] as unknown[] }));
  if (viewOnce.rows.length) return void res.status(403).json({ success: false, message: "View Once messages cannot be forwarded." });

  const depthResult = await pool.query(`WITH RECURSIVE chain AS (
    SELECT id, forwarded_from_message_id, 0 AS depth FROM messages WHERE id=$1
    UNION ALL
    SELECT m.id, m.forwarded_from_message_id, c.depth + 1
    FROM messages m JOIN chain c ON m.id=c.forwarded_from_message_id
    WHERE c.depth < 10
  ) SELECT COALESCE(MAX(depth),0)::int AS depth FROM chain`, [source.id]);
  const sourceDepth = Number(depthResult.rows[0]?.depth ?? 0);
  if (sourceDepth >= 5 && body.data.forwards.length !== 1) return void res.status(400).json({ success: false, message: "Messages forwarded many times can only be forwarded to one chat at a time." });

  const destinationIds = body.data.forwards.map((item) => item.conversationId);
  if (new Set(destinationIds).size !== destinationIds.length) return void res.status(400).json({ success: false, message: "Each destination chat can only be selected once." });
  const destinationRows = await db.select({ id: conversations.id, conversationType: conversations.conversationType, status: conversations.status, locked: conversations.locked, deleted: conversations.deleted })
    .from(conversations)
    .where(inArray(conversations.id, destinationIds));
  if (destinationRows.length !== destinationIds.length) return void res.status(404).json({ success: false, message: "One or more destination chats no longer exist." });
  const groupCount = destinationRows.filter((row) => row.conversationType === "group").length;
  if (sourceDepth > 0 && groupCount > 1) return void res.status(400).json({ success: false, message: "A forwarded message can be sent to at most one group chat in a single forward operation." });

  await ensureDeviceTable();
  const createdMessages: Array<Record<string, unknown>> = [];
  for (const destination of body.data.forwards) {
    if (destination.conversationId === source.conversationId) return void res.status(400).json({ success: false, message: "Choose a different destination chat." });
    if (destination.status !== "active" || destination.locked || destination.deleted) return void res.status(403).json({ success: false, message: "One of the selected chats is unavailable." });
    if (!(await requireMember(profileId, destination.conversationId))) return void res.status(403).json({ success: false, message: "You are not a member of one of the selected chats." });

    const activeDevices = await pool.query(`SELECT k.device_id, k.profile_id FROM redom_device_crypto_keys k JOIN conversation_participants cp ON cp.user_id=k.profile_id WHERE cp.conversation_id=$1 AND cp.active_member=true AND cp.temporarily_suspended=false AND cp.permanently_removed=false AND k.revoked_at IS NULL`, [destination.conversationId]);
    const allowed = new Set(activeDevices.rows.map((row) => row.device_id));
    const senderDevices = activeDevices.rows.filter((row) => row.profile_id === profileId).map((row) => row.device_id);
    for (const deviceId of Object.keys(destination.encryptedPayload)) {
      if (!allowed.has(deviceId)) return void res.status(400).json({ success: false, message: "An encrypted recipient is not an active device in one of the selected chats." });
    }
    if (!senderDevices.some((deviceId) => destination.encryptedPayload[deviceId])) return void res.status(400).json({ success: false, message: "The sender's current device envelope is required for every forwarded destination." });

    const [created] = await db.insert(messages).values({
      conversationId: destination.conversationId,
      senderId: profileId,
      parentMessageId: null,
      forwardedFromMessageId: source.id,
      isForwarded: true,
      messageType: source.messageType,
      message: null,
      caption: null,
      sent: true,
      delivered: false,
      read: false,
      aiReviewed: false,
      moderationStatus: "approved",
      encryptedPayload: destination.encryptedPayload,
      encryptionVersion: 1,
      encryptedAt: new Date(),
    }).returning();
    if (!created) return void res.status(500).json({ success: false, message: "Unable to persist the forwarded message." });
    await db.update(conversations).set({ messageCount: sql`${conversations.messageCount} + 1`, updatedAt: new Date() }).where(eq(conversations.id, destination.conversationId));

    const recipients = await db.select({ userId: conversationParticipants.userId, notificationsEnabled: conversationParticipants.notificationsEnabled, muted: conversationParticipants.muted })
      .from(conversationParticipants)
      .where(and(eq(conversationParticipants.conversationId, destination.conversationId), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.temporarilySuspended, false), eq(conversationParticipants.permanentlyRemoved, false), sql`${conversationParticipants.userId} <> ${profileId}`));
    for (const recipient of recipients) {
      await db.update(conversationParticipants).set({ unreadMessageCount: sql`${conversationParticipants.unreadMessageCount} + 1` }).where(and(eq(conversationParticipants.conversationId, destination.conversationId), eq(conversationParticipants.userId, recipient.userId)));
      if (recipient.notificationsEnabled && !recipient.muted) await db.insert(notifications).values({ recipientUserId: recipient.userId, actorUserId: profileId, messageId: created.id, conversationId: destination.conversationId, notificationType: "message", title: "Forwarded message", body: "You have a new forwarded ReDom message.", actionUrl: `redom://messages/${destination.conversationId}`, unread: true, read: false, inAppDelivered: true, priority: "normal" });
    }
    createdMessages.push({ ...created, forwardedMany: sourceDepth + 1 >= 5 });
  }

  res.status(201).json({ success: true, sourceMessageId: source.id, forwardedCount: createdMessages.length, forwardedMany: sourceDepth + 1 >= 5, messages: createdMessages });
});

export default router;
