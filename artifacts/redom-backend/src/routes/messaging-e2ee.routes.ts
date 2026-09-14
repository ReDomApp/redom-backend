import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { pool } from "../database/db";

const router = Router();
router.use(authMiddleware, authRateLimit);

async function profileIdFor(userId: string): Promise<string | null> {
  const result = await pool.query("SELECT id FROM user_profiles WHERE user_id = $1 LIMIT 1", [userId]);
  return result.rows[0]?.id ?? null;
}

router.put("/crypto/device-key", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const body = z.object({ publicKey: z.string().regex(/^[0-9a-f]{64}$/i) }).strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ success: false, message: "A valid X25519 public key is required." });
  const profileId = await profileIdFor(req.user.userId);
  if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });
  await pool.query(`INSERT INTO redom_device_crypto_keys(profile_id, public_key, algorithm, key_version, updated_at)
    VALUES ($1,$2,'X25519-AES-256-GCM',1,now())
    ON CONFLICT(profile_id) DO UPDATE SET public_key=EXCLUDED.public_key, algorithm=EXCLUDED.algorithm, key_version=EXCLUDED.key_version, updated_at=now()`, [profileId, body.data.publicKey.toLowerCase()]);
  res.json({ success: true, profileId, publicKey: body.data.publicKey.toLowerCase(), algorithm: "X25519-AES-256-GCM", keyVersion: 1 });
});

router.get("/crypto/device-key/:profileId", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const profileId = z.string().uuid().safeParse(req.params.profileId);
  if (!profileId.success) return void res.status(400).json({ success: false, message: "Invalid profile." });
  const result = await pool.query("SELECT public_key, algorithm, key_version, updated_at FROM redom_device_crypto_keys WHERE profile_id=$1 LIMIT 1", [profileId.data]);
  if (!result.rows[0]) return void res.status(404).json({ success: false, message: "The recipient has not registered an encryption key on this device." });
  res.json({ success: true, profileId: profileId.data, publicKey: result.rows[0].public_key, algorithm: result.rows[0].algorithm, keyVersion: result.rows[0].key_version, updatedAt: result.rows[0].updated_at });
});

export default router;
