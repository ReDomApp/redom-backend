import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, eq, ne, sql } from "drizzle-orm";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { db } from "../database/db";
import { conversations } from "../database/conversations";
import { conversationParticipants } from "../database/conversationParticipants";
import { messages } from "../database/messages";
import { messageAttachments } from "../database/messageAttachments";
import { notifications } from "../database/notifications";
import { activityLog } from "../database/activityLog";
import { userProfiles } from "../database/userProfiles";
import { env } from "../config/env";

const router = Router();
const MAX_BYTES = 10 * 1024 * 1024;
const allowed = new Set(["photo", "video", "voice", "audio", "document", "gif", "sticker"]);
const mimeExt: Record<string, string> = { "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/webm": "webm", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "application/pdf": "pdf" };
const r2 = new S3Client({ region: env.cloudflare.r2.region || "auto", endpoint: env.cloudflare.r2.endpoint, credentials: { accessKeyId: env.cloudflare.r2.accessKeyId, secretAccessKey: env.cloudflare.r2.secretAccessKey } });
function parseDataUri(value: string) { const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(value); if (!match) throw new Error("Invalid media payload."); const mime = match[1].toLowerCase(); const body = Buffer.from(match[2], "base64"); if (!body.length || body.length > MAX_BYTES) throw new Error("Message media must be 10 MB or smaller."); return { mime, body }; }
async function profileIdFor(userId: string) { const [profile] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1); return profile?.id ?? null; }

router.get(/^\/media\/(.+)$/, async (req, res) => { const key = String(req.params[0] || ""); if (!key.startsWith("messages/") || key.includes("..")) return void res.status(400).end(); try { const object = await r2.send(new GetObjectCommand({ Bucket: env.cloudflare.r2.bucketName, Key: key })); if (!object.Body) return void res.status(404).end(); res.setHeader("Cache-Control", "private, max-age=300"); res.setHeader("Content-Type", object.ContentType || "application/octet-stream"); return res.end(Buffer.from(await object.Body.transformToByteArray())); } catch { return void res.status(404).end(); } });
router.use(authMiddleware, authRateLimit);

router.get("/messages/:messageId/attachment", async (req, res) => { if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." }); const messageId = z.string().uuid().safeParse(req.params.messageId); if (!messageId.success) return void res.status(400).json({ success: false, message: "Invalid message id." }); const profileId = await profileIdFor(req.user.userId); if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." }); const [message] = await db.select({ conversationId: messages.conversationId, deletedForEveryone: messages.deletedForEveryone }).from(messages).where(eq(messages.id, messageId.data)).limit(1); if (!message || message.deletedForEveryone) return void res.status(404).json({ success: false, message: "Attachment not found." }); const [member] = await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, message.conversationId), eq(conversationParticipants.userId, profileId), eq(conversationParticipants.activeMember, true))).limit(1); if (!member) return void res.status(403).json({ success: false, message: "You do not have access to this attachment." }); const [attachment] = await db.select().from(messageAttachments).where(and(eq(messageAttachments.messageId, messageId.data), eq(messageAttachments.active, true), eq(messageAttachments.deleted, false))).limit(1); if (!attachment) return void res.status(404).json({ success: false, message: "Attachment not found." }); res.json({ success: true, attachment }); });

router.post("/conversations/:conversationId/media", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const conversationId = z.string().uuid().safeParse(req.params.conversationId);
  const parsed = z.object({ type: z.string().min(1).max(40), dataUri: z.string().min(20), caption: z.string().max(5000).optional(), parentMessageId: z.string().uuid().optional(), durationSeconds: z.number().int().min(0).max(86400).optional(), waveform: z.array(z.number().min(0).max(1)).max(256).optional() }).strict().safeParse(req.body);
  if (!conversationId.success || !parsed.success || !allowed.has(parsed.data.type)) return void res.status(400).json({ success: false, message: "A supported message media payload is required." });
  const profileId = await profileIdFor(req.user.userId); if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });
  const [member] = await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, conversationId.data), eq(conversationParticipants.userId, profileId), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.temporarilySuspended, false), eq(conversationParticipants.permanentlyRemoved, false))).limit(1);
  if (!member) return void res.status(403).json({ success: false, message: "You cannot send media in this conversation." });
  const [conversation] = await db.select().from(conversations).where(and(eq(conversations.id, conversationId.data), eq(conversations.deleted, false), eq(conversations.locked, false), eq(conversations.status, "active"))).limit(1); if (!conversation) return void res.status(403).json({ success: false, message: "This conversation is unavailable." });
  if (parsed.data.parentMessageId) { const [parent] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.id, parsed.data.parentMessageId), eq(messages.conversationId, conversationId.data), eq(messages.deletedForEveryone, false))).limit(1); if (!parent) return void res.status(400).json({ success: false, message: "The reply target is unavailable." }); }
  try {
    const media = parseDataUri(parsed.data.dataUri); const extension = mimeExt[media.mime] || (media.mime.split("/")[1] || "bin").replace(/[^a-z0-9]+/gi, "").slice(0, 10) || "bin"; const key = `messages/${conversationId.data}/${randomUUID()}.${extension}`;
    await r2.send(new PutObjectCommand({ Bucket: env.cloudflare.r2.bucketName, Key: key, Body: media.body, ContentType: media.mime }));
    const [created] = await db.insert(messages).values({ conversationId: conversationId.data, senderId: profileId, parentMessageId: parsed.data.parentMessageId, messageType: parsed.data.type, message: parsed.data.caption || null, caption: parsed.data.caption || null, sent: true, delivered: false, read: false, aiReviewed: false, moderationStatus: "approved" }).returning(); if (!created) return void res.status(500).json({ success: false, message: "Unable to persist message." });
    const [attachment] = await db.insert(messageAttachments).values({ messageId: created.id, attachmentType: parsed.data.type, fileUrl: `/messages/media/${key}`, fileName: `${created.id}.${extension}`, mimeType: media.mime, fileExtension: extension, fileSize: media.body.length, durationSeconds: parsed.data.durationSeconds, waveform: parsed.data.waveform ? JSON.stringify(parsed.data.waveform) : null, compressed: true, exifRemoved: true, processingCompleted: true, active: true, processing: false, failed: false, virusScanned: false }).returning();
    await db.update(conversations).set({ messageCount: sql`${conversations.messageCount} + 1`, updatedAt: new Date() }).where(eq(conversations.id, conversationId.data));
    const recipients = await db.select({ userId: conversationParticipants.userId, notificationsEnabled: conversationParticipants.notificationsEnabled, muted: conversationParticipants.muted }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, conversationId.data), eq(conversationParticipants.activeMember, true), ne(conversationParticipants.userId, profileId)));
    for (const recipient of recipients) { await db.update(conversationParticipants).set({ unreadMessageCount: sql`${conversationParticipants.unreadMessageCount} + 1` }).where(and(eq(conversationParticipants.conversationId, conversationId.data), eq(conversationParticipants.userId, recipient.userId))); if (recipient.notificationsEnabled && !recipient.muted) await db.insert(notifications).values({ recipientUserId: recipient.userId, actorUserId: profileId, messageId: created.id, conversationId: conversationId.data, notificationType: "message", title: parsed.data.type === "voice" ? "New voice message" : "New media message", body: parsed.data.caption || `You received a new ReDom ${parsed.data.type} message.`, actionUrl: `redom://messages/${conversationId.data}`, unread: true, read: false, inAppDelivered: true, priority: "normal" }); }
    await db.insert(activityLog).values({ userId: req.user.userId, activityType: "message_media_sent", activityCategory: "messages", activityTitle: "Message media sent", activityDescription: `A ReDom ${parsed.data.type} message was sent.`, targetId: created.id, targetType: "message", targetUrl: `redom://messages/${conversationId.data}`, status: "success", triggeredBy: "user", source: "app", undoSupported: true, hidden: false, archived: false });
    res.status(201).json({ success: true, message: created, attachment });
  } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to upload message media." }); }
});
export default router;
