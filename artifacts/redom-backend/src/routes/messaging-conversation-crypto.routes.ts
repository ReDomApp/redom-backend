import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { db, pool } from "../database/db";
import { conversationParticipants } from "../database/conversationParticipants";
import { conversations } from "../database/conversations";
import { userProfiles } from "../database/userProfiles";

const router = Router();
router.use(authMiddleware, authRateLimit);

const wrappedKeyEnvelope = z.object({
  version: z.literal(1),
  algorithm: z.literal("X25519-AES-256-GCM"),
  ephemeralPublicKey: z.string().regex(/^[0-9a-f]{64}$/i),
  ciphertext: z.string().min(32).max(10000),
}).strict();
const envelopeMap = z.record(z.string().uuid(), wrappedKeyEnvelope).refine((value) => Object.keys(value).length > 0, "At least one device envelope is required.");

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS redom_conversation_crypto_keys (
      conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
      key_version integer NOT NULL DEFAULT 1,
      algorithm varchar(60) NOT NULL DEFAULT 'AES-256-GCM-CONVERSATION-KEY',
      membership_epoch integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL REFERENCES user_profiles(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS redom_conversation_crypto_envelopes (
      conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      key_version integer NOT NULL,
      device_id uuid NOT NULL,
      envelope jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (conversation_id, key_version, device_id)
    );
    CREATE INDEX IF NOT EXISTS redom_conversation_crypto_env_device_idx
      ON redom_conversation_crypto_envelopes(device_id, conversation_id, key_version);
  `);
}

async function profileIdFor(userId: string) {
  const result = await pool.query("SELECT id FROM user_profiles WHERE user_id=$1 LIMIT 1", [userId]);
  return result.rows[0]?.id ?? null;
}

async function requireMember(userId: string, conversationId: string) {
  const profileId = await profileIdFor(userId);
  if (!profileId) return null;
  const [member] = await db.select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, profileId),
      eq(conversationParticipants.activeMember, true),
      eq(conversationParticipants.temporarilySuspended, false),
      eq(conversationParticipants.permanentlyRemoved, false),
    )).limit(1);
  return member ? profileId : null;
}

async function activeDevices(conversationId: string) {
  const result = await pool.query(`
    SELECT k.device_id, k.profile_id, k.public_key
    FROM redom_device_crypto_keys k
    JOIN conversation_participants cp ON cp.user_id=k.profile_id
    WHERE cp.conversation_id=$1
      AND cp.active_member=true
      AND cp.temporarily_suspended=false
      AND cp.permanently_removed=false
      AND k.revoked_at IS NULL
  `, [conversationId]);
  return result.rows as Array<{ device_id: string; profile_id: string; public_key: string }>;
}

router.get("/crypto/conversations/:conversationId/key", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const conversationId = z.string().uuid().safeParse(req.params.conversationId);
  if (!conversationId.success) return void res.status(400).json({ success: false, message: "Invalid conversation." });
  const profileId = await requireMember(req.user.userId, conversationId.data);
  if (!profileId) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  const deviceId = z.string().uuid().safeParse(String(req.query.deviceId ?? ""));
  if (!deviceId.success) return void res.status(400).json({ success: false, message: "A valid device is required." });
  await ensureTables();
  const state = await pool.query("SELECT key_version, algorithm, membership_epoch FROM redom_conversation_crypto_keys WHERE conversation_id=$1 LIMIT 1", [conversationId.data]);
  if (!state.rows[0]) return void res.status(404).json({ success: false, initialized: false, message: "Conversation encryption has not been established." });
  const envelope = await pool.query("SELECT envelope FROM redom_conversation_crypto_envelopes WHERE conversation_id=$1 AND key_version=$2 AND device_id=$3 LIMIT 1", [conversationId.data, state.rows[0].key_version, deviceId.data]);
  const all = await pool.query("SELECT device_id FROM redom_conversation_crypto_envelopes WHERE conversation_id=$1 AND key_version=$2", [conversationId.data, state.rows[0].key_version]);
  if (!envelope.rows[0]) return void res.status(409).json({ success: false, initialized: true, needsDeviceEnvelope: true, keyVersion: state.rows[0].key_version, deviceIds: all.rows.map((row) => row.device_id) });
  res.json({ success: true, initialized: true, keyVersion: state.rows[0].key_version, algorithm: state.rows[0].algorithm, membershipEpoch: state.rows[0].membership_epoch, envelope: envelope.rows[0].envelope, deviceIds: all.rows.map((row) => row.device_id) });
});

router.post("/crypto/conversations/:conversationId/key/initialize", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const conversationId = z.string().uuid().safeParse(req.params.conversationId);
  const body = z.object({ deviceId: z.string().uuid(), envelopes: envelopeMap }).strict().safeParse(req.body);
  if (!conversationId.success || !body.success) return void res.status(400).json({ success: false, message: "A valid device and encrypted conversation key envelopes are required." });
  const profileId = await requireMember(req.user.userId, conversationId.data);
  if (!profileId) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  await ensureTables();
  const [conversation] = await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, conversationId.data), eq(conversations.deleted, false), eq(conversations.status, "active"))).limit(1);
  if (!conversation) return void res.status(404).json({ success: false, message: "Conversation not found." });
  const devices = await activeDevices(conversationId.data);
  const allowed = new Set(devices.map((device) => device.device_id));
  if (!allowed.has(body.data.deviceId)) return void res.status(403).json({ success: false, message: "The initializing device is not an active conversation device." });
  for (const deviceId of Object.keys(body.data.envelopes)) if (!allowed.has(deviceId)) return void res.status(400).json({ success: false, message: "Every conversation-key envelope must target an active conversation device." });
  const existing = await pool.query("SELECT key_version FROM redom_conversation_crypto_keys WHERE conversation_id=$1 LIMIT 1", [conversationId.data]);
  if (existing.rows[0]) return void res.status(409).json({ success: false, initialized: true, keyVersion: existing.rows[0].key_version, message: "Conversation encryption is already established." });
  await pool.query("INSERT INTO redom_conversation_crypto_keys(conversation_id,key_version,algorithm,membership_epoch,created_by) VALUES($1,1,'AES-256-GCM-CONVERSATION-KEY',1,$2)", [conversationId.data, profileId]);
  for (const [deviceId, envelope] of Object.entries(body.data.envelopes)) {
    await pool.query("INSERT INTO redom_conversation_crypto_envelopes(conversation_id,key_version,device_id,envelope) VALUES($1,1,$2,$3::jsonb)", [conversationId.data, deviceId, JSON.stringify(envelope)]);
  }
  res.status(201).json({ success: true, initialized: true, keyVersion: 1, deviceIds: Object.keys(body.data.envelopes) });
});

router.post("/crypto/conversations/:conversationId/key/envelopes", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const conversationId = z.string().uuid().safeParse(req.params.conversationId);
  const body = z.object({ deviceId: z.string().uuid(), envelopes: envelopeMap }).strict().safeParse(req.body);
  if (!conversationId.success || !body.success) return void res.status(400).json({ success: false, message: "A valid device and encrypted conversation key envelopes are required." });
  const profileId = await requireMember(req.user.userId, conversationId.data);
  if (!profileId) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  await ensureTables();
  const state = await pool.query("SELECT key_version FROM redom_conversation_crypto_keys WHERE conversation_id=$1 LIMIT 1", [conversationId.data]);
  if (!state.rows[0]) return void res.status(409).json({ success: false, initialized: false, message: "Initialize conversation encryption before adding device envelopes." });
  const devices = await activeDevices(conversationId.data);
  const allowed = new Set(devices.map((device) => device.device_id));
  if (!allowed.has(body.data.deviceId)) return void res.status(403).json({ success: false, message: "The requesting device is not an active conversation device." });
  for (const deviceId of Object.keys(body.data.envelopes)) if (!allowed.has(deviceId)) return void res.status(400).json({ success: false, message: "Every conversation-key envelope must target an active conversation device." });
  for (const [deviceId, envelope] of Object.entries(body.data.envelopes)) {
    await pool.query("INSERT INTO redom_conversation_crypto_envelopes(conversation_id,key_version,device_id,envelope) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(conversation_id,key_version,device_id) DO UPDATE SET envelope=EXCLUDED.envelope,updated_at=now()", [conversationId.data, state.rows[0].key_version, deviceId, JSON.stringify(envelope)]);
  }
  res.json({ success: true, keyVersion: state.rows[0].key_version, added: Object.keys(body.data.envelopes).length });
});

export default router;
