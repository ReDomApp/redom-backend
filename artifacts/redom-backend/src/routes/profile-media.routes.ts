import { createHash, createHmac, randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { pool } from "../database/db";
import { env } from "../config/env";

const router = Router();
const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const DEFAULT_KEY = "__redom_default__";

function shareId() { let out = ""; for (let i = 0; i < 10; i += 1) out += chars[Math.floor(Math.random() * chars.length)]; return out; }
function wordCount(value: string) { return value.trim() ? value.trim().split(/\s+/).filter(Boolean).length : 0; }
function parseDataUri(value: string) {
  const raster = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (raster) { const mime = raster[1] === "image/jpg" ? "image/jpeg" : raster[1]; const body = Buffer.from(raster[2], "base64"); if (!body.length || body.length > 8 * 1024 * 1024) throw new Error("Profile media must be 8 MB or smaller."); return { mime, body }; }
  const svg = /^data:image\/svg\+xml(?:;charset=utf-8)?,(.+)$/s.exec(value);
  if (svg) { const body = Buffer.from(decodeURIComponent(svg[1]), "utf8"); if (!body.length || body.length > 8 * 1024 * 1024) throw new Error("Profile media must be 8 MB or smaller."); if (/<script|<foreignObject|javascript:/i.test(body.toString("utf8"))) throw new Error("Invalid profile media."); return { mime: "image/svg+xml", body }; }
  throw new Error("Only JPEG, PNG, WebP, or ReDom captioned SVG images are supported.");
}
function expiryFor(value: string | undefined) {
  if (!value || value === "permanent") return null;
  const hours = value === "1h" ? 1 : value === "24h" ? 24 : value === "7d" ? 168 : null;
  return hours ? new Date(Date.now() + hours * 3600000) : undefined;
}
function hmac(key: Buffer | string, data: string) { return createHmac("sha256", key).update(data).digest(); }
async function signedRequest(method: string, key: string, body?: Buffer) {
  const endpoint = env.cloudflare.r2.endpoint.replace(/\/$/, "");
  const url = new URL(`${endpoint}/${key.split("/").map(encodeURIComponent).join("/")}`);
  const now = new Date(); const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update(body ?? "").digest("hex"); const host = url.host; const canonicalUri = url.pathname || "/";
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash("sha256").update(canonicalRequest).digest("hex")}`;
  const kDate = hmac(`AWS4${env.cloudflare.r2.secretAccessKey}`, dateStamp); const kRegion = hmac(kDate, "auto"); const kService = hmac(kRegion, "s3"); const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  return { url, headers: { Host: host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, Authorization: `AWS4-HMAC-SHA256 Credential=${env.cloudflare.r2.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` } };
}
async function putR2(key: string, body: Buffer, contentType: string) {
  const signed = await signedRequest("PUT", key, body);
  const response = await fetch(signed.url, { method: "PUT", headers: { ...signed.headers, "Content-Type": contentType }, body });
  if (!response.ok) throw new Error(`R2 upload failed (${response.status}).`);
}
async function restoreExpiredProfiles() {
  await pool.query(`UPDATE user_profiles SET profile_photo=COALESCE(profile_photo_previous,$1), profile_photo_previous=NULL, profile_photo_expires_at=NULL, updated_at=NOW() WHERE profile_photo_expires_at IS NOT NULL AND profile_photo_expires_at <= NOW()`, [DEFAULT_KEY]);
  await pool.query(`UPDATE profile_media_history SET archived_at=NOW() WHERE temporary_until IS NOT NULL AND temporary_until <= NOW() AND archived_at IS NULL`);
}

router.get("/default.svg", (_req, res) => {
  res.type("image/svg+xml").send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="128" fill="#E4E6EB"/><circle cx="128" cy="96" r="48" fill="#65676B"/><path d="M45 224c9-48 43-72 83-72s74 24 83 72" fill="#65676B"/></svg>`);
});

router.get("/file/:key(*)", async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key || "");
    if (!key.startsWith("profiles/") || key.includes("..")) return res.status(400).end();
    const signed = await signedRequest("GET", key);
    const response = await fetch(signed.url, { headers: signed.headers });
    if (!response.ok || !response.body) return res.status(response.status === 404 ? 404 : 502).end();
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
    const buffer = Buffer.from(await response.arrayBuffer());
    return res.end(buffer);
  } catch { return res.status(404).end(); }
});

router.use(authMiddleware);

router.get("/current", async (req: Request, res: Response) => {
  try {
    await restoreExpiredProfiles();
    const r = await pool.query(`SELECT p.id,p.published_at,p.content,pm.object_key,pm.thumbnail_key,pm.share_id FROM posts p JOIN post_media pm ON pm.post_id=p.id AND pm.is_primary=true WHERE p.user_id=$1 AND p.type='profile_photo' AND p.deleted=false ORDER BY p.published_at DESC LIMIT 1`, [req.user.userId]);
    if (!r.rows.length) return res.json({ success: true, media: null });
    const row = r.rows[0]; return res.json({ success: true, media: { postId: row.id, publishedAt: row.published_at, caption: row.content, objectKey: row.object_key, thumbnailKey: row.thumbnail_key, shareId: row.share_id } });
  } catch { return res.status(500).json({ success: false, message: "Unable to load profile picture." }); }
});

router.post("/upload", async (req: Request, res: Response) => {
  const kind = req.body?.kind === "cover" ? "cover" : "profile";
  const image = typeof req.body?.image === "string" ? req.body.image : "";
  const caption = typeof req.body?.caption === "string" ? req.body.caption.trim() : "";
  const temporary = typeof req.body?.temporary === "string" ? req.body.temporary : "permanent";
  if (!image) return res.status(400).json({ success: false, message: "Image is required." });
  if (caption && wordCount(caption) > 20) return res.status(400).json({ success: false, message: "The caption can contain up to 20 words." });
  if (!["permanent", "1h", "24h", "7d"].includes(temporary)) return res.status(400).json({ success: false, message: "Invalid temporary duration." });
  try {
    await restoreExpiredProfiles();
    const parsed = parseDataUri(image); const ext = parsed.mime === "image/png" ? "png" : parsed.mime === "image/webp" ? "webp" : "jpg";
    const key = `profiles/${req.user.userId}/${kind}/${Date.now()}-${randomUUID()}.${ext}`; await putR2(key, parsed.body, parsed.mime);
    const expiry = kind === "profile" ? expiryFor(temporary) : null; const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO user_profiles (user_id,display_name) SELECT id,trim(concat_ws(' ',first_name,last_name)) FROM users WHERE id=$1 ON CONFLICT (user_id) DO NOTHING`, [req.user.userId]);
      const previous = kind === "profile" ? (await client.query(`SELECT profile_photo FROM user_profiles WHERE user_id=$1 FOR UPDATE`, [req.user.userId])).rows[0]?.profile_photo ?? null : null;
      const mediaShareId = shareId();
      if (kind === "profile") await client.query(`UPDATE user_profiles SET profile_photo=$1,profile_photo_previous=$2,profile_photo_expires_at=$3,updated_at=NOW() WHERE user_id=$4`, [key, expiry ? previous : null, expiry, req.user.userId]);
      else await client.query(`UPDATE user_profiles SET cover_photo=$1,updated_at=NOW() WHERE user_id=$2`, [key, req.user.userId]);
      await client.query(`INSERT INTO profile_media_history (user_id,kind,object_key,previous_object_key,share_id,caption,temporary_until) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [req.user.userId, kind, key, expiry ? previous : null, mediaShareId, caption || null, expiry]);
      let postId: string | null = null;
      if (req.body?.shareToFeed !== false) {
        postId = (await client.query(`INSERT INTO posts (user_id,share_id,content,type,visibility,comments_enabled,sharing_enabled,published_at,created_at,updated_at) VALUES ($1,$2,$3,$4,'public',true,true,NOW(),NOW(),NOW()) RETURNING id`, [req.user.userId, mediaShareId, caption || null, kind === "profile" ? "profile_photo" : "cover_photo"])).rows[0].id;
        await client.query(`INSERT INTO post_media (post_id,share_id,media_type,object_key,file_name,mime_type,file_size,is_primary,processing_status,moderation_status,caption,uploaded_at,created_at,updated_at) VALUES ($1,$2,'image',$3,$4,$5,$6,true,'ready','pending',$7,NOW(),NOW(),NOW())`, [postId, shareId(), key, `${kind}-${Date.now()}.${ext}`, parsed.mime, parsed.body.length, caption || null]);
        await client.query(`UPDATE user_profiles SET post_count=COALESCE(post_count,0)+1,updated_at=NOW() WHERE user_id=$1`, [req.user.userId]);
      }
      await client.query("COMMIT");
      return res.json({ success: true, kind, postId, shareId: mediaShareId, uploadedAt: new Date().toISOString(), expiresAt: expiry?.toISOString() ?? null, message: `${kind === "profile" ? "Profile picture" : "Cover photo"} uploaded.` });
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  } catch (error) { return res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to upload profile media." }); }
});

export default router;
