import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { createHash, timingSafeEqual } from "node:crypto";
import { pool } from "../database/db";

function secrets() {
  const access = process.env.JWT_ACCESS_SECRET;
  if (!access) throw new Error("JWT_ACCESS_SECRET is not configured.");
  return access;
}

function apiKeyAllowed(req: Request): boolean {
  const parts = req.path.split("/").filter(Boolean);
  if (parts[0] !== "aurelink") return false;
  if (req.method === "GET") {
    if ((parts[1] === "status" || parts[1] === "orders") && parts.length === 2) return true;
    if ((parts[1] === "catalog" || parts[1] === "nonvoip") && parts.length >= 3) return true;
    if (parts[1] === "dedicated" && parts[2] === "countries" && parts.length === 3) return true;
    if ((parts[1] === "activations" || parts[1] === "rentals") && parts.length === 3) return true;
    if ((parts[1] === "activations" || parts[1] === "rentals") && parts.length === 4 && parts[3] === "messages") return true;
    if (parts[1] === "dedicated" && parts[2] === "orders" && parts.length === 5 && parts[4] === "messages") return true;
  }
  if (req.method === "POST") {
    return ["/aurelink/quotes", "/aurelink/checkout", "/aurelink/activations", "/aurelink/rentals", "/aurelink/dedicated/quote", "/aurelink/dedicated/orders"].includes(req.path);
  }
  return false;
}

async function authenticateApiKey(secret: string, req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!apiKeyAllowed(req)) { res.status(403).json({ success: false, message: "This API key cannot access account or security endpoints." }); return; }
  const digest = createHash("sha256").update(secret).digest();
  const found = await pool.query("SELECT k.id, k.user_id, k.key_hash, u.account_status FROM aurelink_api_keys k JOIN aurelink_users u ON u.id=k.user_id WHERE k.key_prefix=$1 AND k.revoked_at IS NULL LIMIT 1", [secret.slice(0, 12)]);
  const row = found.rows[0] as { id: string; user_id: string; key_hash: string; account_status: string } | undefined;
  if (!row || row.key_hash.length !== 64 || !timingSafeEqual(Buffer.from(row.key_hash, "hex"), Buffer.from(digest.toString("hex"), "hex"))) { res.status(401).json({ success: false, message: "Invalid or revoked Aurelink API key." }); return; }
  if (row.account_status !== "active") { res.status(403).json({ success: false, message: "Aurelink account is not active." }); return; }
  await pool.query("UPDATE aurelink_api_keys SET last_used_at=NOW() WHERE id=$1", [row.id]);
  req.user = { userId: row.user_id, profileId: row.user_id, sessionId: "api-key:" + row.id };
  next();
}
export async function aurelinkAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = req.headers.authorization;
    if (!raw?.startsWith("Bearer ")) { res.status(401).json({success:false,message:"Aurelink authentication required."}); return; }
    const credential = raw.slice(7).trim();
    if (credential.startsWith("aul_")) { await authenticateApiKey(credential, req, res, next); return; }
    const payload = jwt.verify(credential, secrets()) as { userId?: string; sessionId?: string; audience?: string };
    if (payload.audience !== "aurelink" || !payload.userId || !payload.sessionId) {
      res.status(401).json({success:false,message:"Invalid Aurelink session."}); return;
    }
    const result = await pool.query(
      `SELECT u.id,u.account_status,s.id AS session_id FROM aurelink_users u
       JOIN aurelink_sessions s ON s.user_id=u.id
       WHERE u.id=$1 AND s.id=$2 AND s.revoked_at IS NULL AND s.expires_at>NOW() `,
      [payload.userId,payload.sessionId]
    );
    const row = result.rows[0];
    if (!row) { res.status(401).json({success:false,message:"Aurelink session expired, was revoked, or was inactive for more than 10 minutes."}); return; }
    if (row.account_status !== "active") { res.status(403).json({success:false,message:"Aurelink account is not active."}); return; }
    await pool.query("UPDATE aurelink_sessions SET last_activity_at=NOW(),updated_at=NOW() WHERE id=$1",[row.session_id]);
    req.user = { userId: row.id, profileId: row.id, sessionId: row.session_id };
    next();
  } catch {
    res.status(401).json({success:false,message:"Invalid Aurelink access token."});
  }
}
