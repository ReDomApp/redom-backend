import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { pool } from "../database/db";
import { z } from "zod";

const router = Router();
router.use(authMiddleware, authRateLimit);

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_LINKED_DEVICES = 4;

async function profileIdFor(userId: string) {
  const result = await pool.query("SELECT id FROM user_profiles WHERE user_id=$1 LIMIT 1", [userId]);
  return result.rows[0]?.id ?? null;
}

async function ensureTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS redom_device_link_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    target_device_id uuid NOT NULL,
    target_public_key text NOT NULL,
    target_label varchar(120),
    target_platform varchar(40),
    code_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  ); CREATE INDEX IF NOT EXISTS redom_device_link_requests_profile_idx ON redom_device_link_requests(profile_id, expires_at);`);
}

function hashCode(code: string) { return createHash("sha256").update(code).digest("hex"); }
function createCode() { return randomBytes(8).toString("hex").slice(0, 8).toUpperCase(); }

router.put("/crypto/device-key", async (req, res, next) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const body = z.object({ deviceId: z.string().uuid() }).strict().safeParse(req.body);
  if (!body.success) return next();
  const profileId = await profileIdFor(req.user.userId); if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });
  await ensureTables();
  const existing = await pool.query("SELECT device_id, revoked_at FROM redom_device_crypto_keys WHERE device_id=$1 AND profile_id=$2 LIMIT 1", [body.data.deviceId, profileId]);
  if (existing.rows.length && existing.rows[0].revoked_at === null) return next();
  const primary = await pool.query("SELECT 1 FROM redom_device_crypto_keys WHERE profile_id=$1 AND primary_device=true AND revoked_at IS NULL LIMIT 1", [profileId]);
  if (!primary.rows.length) return next();
  const approved = await pool.query("SELECT 1 FROM redom_device_link_requests WHERE profile_id=$1 AND target_device_id=$2 AND approved_at IS NOT NULL ORDER BY approved_at DESC LIMIT 1", [profileId, body.data.deviceId]);
  if (!approved.rows.length) return void res.status(403).json({ success: false, message: "This device must be approved by the primary device before its encryption identity can be registered." });
  next();
});

router.post("/crypto/link/start", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const body = z.object({ deviceId: z.string().uuid(), publicKey: z.string().regex(/^[0-9a-f]{64}$/i), deviceLabel: z.string().max(120).optional(), platform: z.string().max(40).optional() }).strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ success: false, message: "A valid device identity is required." });
  const profileId = await profileIdFor(req.user.userId); if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });
  await ensureTables();
  const device = await pool.query("SELECT device_id, primary_device, revoked_at FROM redom_device_crypto_keys WHERE device_id=$1 AND profile_id=$2 LIMIT 1", [body.data.deviceId, profileId]);
  if (device.rows.length && device.rows[0].revoked_at === null) return void res.status(409).json({ success: false, message: "This device is already active." });
  const active = await pool.query("SELECT COUNT(*)::int AS count FROM redom_device_crypto_keys WHERE profile_id=$1 AND revoked_at IS NULL AND primary_device=false", [profileId]);
  if (Number(active.rows[0]?.count ?? 0) >= MAX_LINKED_DEVICES) return void res.status(409).json({ success: false, message: "You already have the maximum number of linked devices." });
  const code = createCode(); const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await pool.query("UPDATE redom_device_link_requests SET approved_at=now() WHERE profile_id=$1 AND approved_at IS NULL AND expires_at > now()", [profileId]);
  const result = await pool.query("INSERT INTO redom_device_link_requests(profile_id,target_device_id,target_public_key,target_label,target_platform,code_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,expires_at", [profileId, body.data.deviceId, body.data.publicKey.toLowerCase(), body.data.deviceLabel ?? null, body.data.platform ?? null, hashCode(code), expiresAt]);
  res.status(201).json({ success: true, requestId: result.rows[0].id, code, expiresAt: result.rows[0].expires_at });
});

router.post("/crypto/link/approve", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const body = z.object({ code: z.string().regex(/^[A-Z0-9]{8}$/) }).strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ success: false, message: "Enter the 8-character linking code." });
  const profileId = await profileIdFor(req.user.userId); if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });
  await ensureTables();
  const primary = await pool.query("SELECT device_id FROM redom_device_crypto_keys WHERE profile_id=$1 AND primary_device=true AND revoked_at IS NULL LIMIT 1", [profileId]);
  if (!primary.rows.length) return void res.status(403).json({ success: false, message: "Only the active primary device can approve a linked device." });
  const request = await pool.query("SELECT id,target_device_id,target_public_key,target_label,target_platform FROM redom_device_link_requests WHERE profile_id=$1 AND code_hash=$2 AND approved_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1", [profileId, hashCode(body.data.code)]);
  if (!request.rows.length) return void res.status(400).json({ success: false, message: "That linking code is invalid or expired." });
  const active = await pool.query("SELECT COUNT(*)::int AS count FROM redom_device_crypto_keys WHERE profile_id=$1 AND revoked_at IS NULL AND primary_device=false", [profileId]);
  if (Number(active.rows[0]?.count ?? 0) >= MAX_LINKED_DEVICES) return void res.status(409).json({ success: false, message: "You already have the maximum number of linked devices." });
  const r = request.rows[0];
  await pool.query("INSERT INTO redom_device_crypto_keys(device_id,profile_id,public_key,algorithm,key_version,device_label,platform,primary_device,revoked_at,updated_at) VALUES($1,$2,$3,'X25519-AES-256-GCM',1,$4,$5,false,NULL,now()) ON CONFLICT(device_id) DO UPDATE SET public_key=EXCLUDED.public_key,device_label=EXCLUDED.device_label,platform=EXCLUDED.platform,revoked_at=NULL,updated_at=now()", [r.target_device_id, profileId, r.target_public_key, r.target_label, r.target_platform]);
  await pool.query("UPDATE redom_device_link_requests SET approved_at=now() WHERE id=$1", [r.id]);
  res.json({ success: true, deviceId: r.target_device_id, deviceLabel: r.target_label, platform: r.target_platform, approved: true });
});

export default router;
