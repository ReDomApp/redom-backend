import { Router, type Request, type Response } from "express";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { authMiddleware } from "../middleware/auth.middleware";
import { pool } from "../database/db";
import { env } from "../config/env";

const router = Router();
router.use(authMiddleware);

const s3 = new S3Client({
  region: env.cloudflare.r2.region,
  endpoint: env.cloudflare.r2.endpoint,
  credentials: { accessKeyId: env.cloudflare.r2.accessKeyId, secretAccessKey: env.cloudflare.r2.secretAccessKey },
});

const idChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function shareId() { let out = ""; for (let i = 0; i < 10; i++) out += idChars[Math.floor(Math.random() * idChars.length)]; return out; }
function words(value: string) { return value.trim() ? value.trim().split(/\s+/).filter(Boolean).length : 0; }
function parseDataUri(value: string) {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("Only JPEG, PNG, or WebP images are supported.");
  const mime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const body = Buffer.from(match[2], "base64");
  if (!body.length || body.length > 8 * 1024 * 1024) throw new Error("Profile media must be 8 MB or smaller.");
  return { mime, body };
}
function expiryFor(value: string | undefined) {
  if (!value || value === "permanent") return null;
  const hours = value === "1h" ? 1 : value === "24h" ? 24 : value === "7d" ? 24 * 7 : null;
  return hours ? new Date(Date.now() + hours * 60 * 60 * 1000) : undefined;
}

router.get("/current", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.published_at, p.content, pm.object_key, pm.thumbnail_key
      FROM posts p JOIN post_media pm ON pm.post_id=p.id AND pm.is_primary=true
      WHERE p.user_id=$1 AND p.type='profile_photo' AND p.deleted=false
      ORDER BY p.published_at DESC LIMIT 1`, [req.user.userId]);
    if (!result.rows.length) return res.json({ success: true, media: null });
    const row = result.rows[0];
    return res.json({ success: true, media: { postId: row.id, publishedAt: row.published_at, caption: row.content, objectKey: row.object_key, thumbnailKey: row.thumbnail_key } });
  } catch { return res.status(500).json({ success: false, message: "Unable to load profile picture." }); }
});

router.post("/upload", async (req: Request, res: Response) => {
  const kind = req.body?.kind === "cover" ? "cover" : "profile";
  const image = typeof req.body?.image === "string" ? req.body.image : "";
  const caption = typeof req.body?.caption === "string" ? req.body.caption.trim() : "";
  const temporary = typeof req.body?.temporary === "string" ? req.body.temporary : "permanent";
  const shareToFeed = req.body?.shareToFeed !== false;
  if (!image) return res.status(400).json({ success: false, message: "Image is required." });
  if (caption && words(caption) > 20) return res.status(400).json({ success: false, message: "The caption can contain up to 20 words." });
  if (!["permanent", "1h", "24h", "7d"].includes(temporary)) return res.status(400).json({ success: false, message: "Invalid temporary duration." });

  try {
    const parsed = parseDataUri(image);
    const extension = parsed.mime === "image/png" ? "png" : parsed.mime === "image/webp" ? "webp" : "jpg";
    const key = `profiles/${req.user.userId}/${kind}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    await s3.send(new PutObjectCommand({ Bucket: env.cloudflare.r2.bucketName, Key: key, Body: parsed.body, ContentType: parsed.mime, CacheControl: "public,max-age=31536000,immutable" }));

    const expiry = kind === "profile" ? expiryFor(temporary) : null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO user_profiles (user_id, display_name) SELECT id, trim(concat_ws(' ', first_name,last_name)) FROM users WHERE id=$1 ON CONFLICT (user_id) DO NOTHING`, [req.user.userId]);
      const previous = kind === "profile" ? (await client.query(`SELECT profile_photo FROM user_profiles WHERE user_id=$1 FOR UPDATE`, [req.user.userId])).rows[0]?.profile_photo ?? null : null;
      if (kind === "profile") {
        await client.query(`UPDATE user_profiles SET profile_photo=$1, profile_photo_previous=$2, profile_photo_expires_at=$3, updated_at=NOW() WHERE user_id=$4`, [key, expiry ? previous : null, expiry, req.user.userId]);
      } else {
        await client.query(`UPDATE user_profiles SET cover_photo=$1, updated_at=NOW() WHERE user_id=$2`, [key, req.user.userId]);
      }

      let postId: string | null = null;
      if (shareToFeed) {
        postId = (await client.query(`INSERT INTO posts (user_id,share_id,content,type,visibility,comments_enabled,sharing_enabled,published_at,created_at,updated_at) VALUES ($1,$2,$3,$4,'public',true,true,NOW(),NOW(),NOW()) RETURNING id`, [req.user.userId, shareId(), caption || null, kind === "profile" ? "profile_photo" : "cover_photo"])).rows[0].id;
        await client.query(`INSERT INTO post_media (post_id,share_id,media_type,object_key,file_name,mime_type,file_size,is_primary,processing_status,moderation_status,caption,uploaded_at,created_at,updated_at) VALUES ($1,$2,'image',$3,$4,$5,$6,true,'ready','pending',$7,NOW(),NOW(),NOW())`, [postId, shareId(), key, `${kind}-${Date.now()}.${extension}`, parsed.mime, parsed.body.length, caption || null]);
        await client.query(`UPDATE user_profiles SET post_count=COALESCE(post_count,0)+1, updated_at=NOW() WHERE user_id=$1`, [req.user.userId]);
      }
      await client.query("COMMIT");
      return res.json({ success: true, kind, postId, expiresAt: expiry?.toISOString() ?? null, message: "Profile media uploaded." });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  } catch (error) {
    return res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to upload profile media." });
  }
});

export default router;
