import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { db, pool } from "../database/db";
import { conversations } from "../database/conversations";
import { conversationParticipants } from "../database/conversationParticipants";
import { userProfiles } from "../database/userProfiles";
import { messages } from "../database/messages";
import { messageDeletions } from "../database/messageDeletions";

const router = Router();
router.use(authMiddleware);

let ready: Promise<void> | null = null;
async function ensureTables() {
  if (!ready) {
    ready = (async () => {
      await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS advanced_chat_privacy boolean NOT NULL DEFAULT false`);
      await pool.query(`ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS media_visibility boolean NOT NULL DEFAULT true`);
      await pool.query(`ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS favorite boolean NOT NULL DEFAULT false`);
      await pool.query(`ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS chat_list varchar(80)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS message_stars (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(message_id, user_id))`);
      await pool.query(`CREATE INDEX IF NOT EXISTS message_stars_user_idx ON message_stars(user_id, created_at DESC)`);
    })().catch((error) => { ready = null; throw error; });
  }
  return ready;
}

async function requireMember(userId: string, conversationId: string) {
  const [profile] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (!profile) return null;
  const [member] = await db.select({ id: conversationParticipants.id, role: conversationParticipants.role, active: conversationParticipants.activeMember }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, profile.id))).limit(1);
  if (!member?.active) return null;
  const [conversation] = await db.select({ id: conversations.id, type: conversations.conversationType }).from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conversation) return null;
  return { profileId: profile.id, member, conversation };
}

async function readSettings(memberId: string, conversationId: string) {
  const [memberRow, conversationRow] = await Promise.all([
    pool.query(`SELECT media_visibility, favorite, chat_list, app_wallpaper, notifications_enabled, muted FROM conversation_participants WHERE id=$1 LIMIT 1`, [memberId]),
    pool.query(`SELECT advanced_chat_privacy FROM conversations WHERE id=$1 LIMIT 1`, [conversationId]),
  ]);
  const values = memberRow.rows[0] ?? {};
  return { advancedChatPrivacy: Boolean(conversationRow.rows[0]?.advanced_chat_privacy), mediaVisibility: values.media_visibility !== false, favorite: Boolean(values.favorite), listName: values.chat_list ?? null, wallpaper: values.app_wallpaper ?? null, notificationsEnabled: values.notifications_enabled !== false, muted: Boolean(values.muted) };
}

router.get("/conversations/:conversationId/chat-info-settings", async (req, res) => {
  await ensureTables();
  const id = z.string().uuid().safeParse(req.params.conversationId);
  if (!id.success || !req.user?.userId) return void res.status(400).json({ success: false, message: "Invalid conversation." });
  const access = await requireMember(req.user.userId, id.data);
  if (!access) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  res.json({ success: true, settings: await readSettings(access.member.id, id.data) });
});

router.patch("/conversations/:conversationId/chat-info-settings", async (req, res) => {
  await ensureTables();
  const id = z.string().uuid().safeParse(req.params.conversationId);
  const parsed = z.object({ advancedChatPrivacy: z.boolean().optional(), mediaVisibility: z.boolean().optional(), favorite: z.boolean().optional(), listName: z.string().trim().max(80).nullable().optional(), wallpaper: z.string().trim().max(255).nullable().optional(), notificationsEnabled: z.boolean().optional(), muted: z.boolean().optional() }).safeParse(req.body);
  if (!id.success || !parsed.success || !req.user?.userId) return void res.status(400).json({ success: false, message: "Invalid chat setting." });
  const access = await requireMember(req.user.userId, id.data);
  if (!access) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  const patch = parsed.data;
  if (patch.advancedChatPrivacy !== undefined) {
    if (access.conversation.type === "group" && !["owner", "admin"].includes(access.member.role)) return void res.status(403).json({ success: false, message: "Only group admins can change Advanced chat privacy." });
    await pool.query(`UPDATE conversations SET advanced_chat_privacy=$1, updated_at=now() WHERE id=$2`, [patch.advancedChatPrivacy, id.data]);
  }
  const updates: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => { updates.push(`${column}=$${values.length + 1}`); values.push(value); };
  if (patch.mediaVisibility !== undefined) set("media_visibility", patch.mediaVisibility);
  if (patch.favorite !== undefined) set("favorite", patch.favorite);
  if (patch.listName !== undefined) set("chat_list", patch.listName || null);
  if (patch.wallpaper !== undefined) set("app_wallpaper", patch.wallpaper || null);
  if (patch.notificationsEnabled !== undefined) set("notifications_enabled", patch.notificationsEnabled);
  if (patch.muted !== undefined) set("muted", patch.muted);
  if (updates.length) { values.push(access.member.id); await pool.query(`UPDATE conversation_participants SET ${updates.join(", ")}, updated_at=now() WHERE id=$${values.length}`, values); }
  res.json({ success: true, settings: await readSettings(access.member.id, id.data) });
});

router.post("/messages/:messageId/star", async (req, res) => {
  await ensureTables();
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const messageId = z.string().uuid().safeParse(req.params.messageId); if (!messageId.success) return void res.status(400).json({ success: false, message: "Invalid message." });
  const [profile] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, req.user.userId)).limit(1);
  const [message] = profile ? await db.select({ id: messages.id, conversationId: messages.conversationId }).from(messages).where(and(eq(messages.id, messageId.data), eq(messages.deletedForEveryone, false))).limit(1) : [];
  if (!profile || !message) return void res.status(404).json({ success: false, message: "Message unavailable." });
  if (!(await requireMember(req.user.userId, message.conversationId))) return void res.status(403).json({ success: false, message: "You do not have access to this message." });
  const lifecycle = await pool.query(`SELECT view_once FROM message_lifecycle WHERE message_id=$1 LIMIT 1`, [message.id]).catch(() => ({ rows: [] as any[] }));
  if (lifecycle.rows[0]?.view_once) return void res.status(409).json({ success: false, message: "View Once messages cannot be starred." });
  await pool.query(`INSERT INTO message_stars(message_id,user_id) VALUES($1,$2) ON CONFLICT(message_id,user_id) DO NOTHING`, [message.id, profile.id]);
  res.json({ success: true, starred: true });
});

router.delete("/messages/:messageId/star", async (req, res) => {
  await ensureTables();
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const messageId = z.string().uuid().safeParse(req.params.messageId); if (!messageId.success) return void res.status(400).json({ success: false, message: "Invalid message." });
  const [profile] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, req.user.userId)).limit(1);
  if (!profile) return void res.status(404).json({ success: false, message: "Profile unavailable." });
  await pool.query(`DELETE FROM message_stars WHERE message_id=$1 AND user_id=$2`, [messageId.data, profile.id]);
  res.json({ success: true, starred: false });
});

router.get("/starred-messages", async (req, res) => {
  await ensureTables();
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const [profile] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, req.user.userId)).limit(1);
  if (!profile) return void res.status(404).json({ success: false, message: "Profile unavailable." });
  const result = await pool.query(`SELECT ms.message_id AS "messageId", ms.created_at AS "starredAt", m.conversation_id AS "conversationId", m.sender_id AS "senderId", m.message_type AS "messageType", m.caption, m.created_at AS "createdAt" FROM message_stars ms JOIN messages m ON m.id=ms.message_id WHERE ms.user_id=$1 AND m.deleted_for_everyone=false ORDER BY ms.created_at DESC LIMIT 500`, [profile.id]);
  res.json({ success: true, messages: result.rows });
});

router.post("/conversations/:conversationId/clear", async (req, res) => {
  await ensureTables();
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const id = z.string().uuid().safeParse(req.params.conversationId); if (!id.success) return void res.status(400).json({ success: false, message: "Invalid conversation." });
  const access = await requireMember(req.user.userId, id.data); if (!access) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  const rows = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.conversationId, id.data), eq(messages.deletedForEveryone, false)));
  if (rows.length) await db.insert(messageDeletions).values(rows.map((row) => ({ messageId: row.id, userId: access.profileId }))).onConflictDoNothing();
  await pool.query(`UPDATE conversation_participants SET unread_message_count=0, updated_at=now() WHERE id=$1`, [access.member.id]);
  res.json({ success: true, cleared: rows.length });
});

export default router;
