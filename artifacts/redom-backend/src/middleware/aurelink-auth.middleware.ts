import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
import { pool } from "../database/db";

function secrets() {
  const access = process.env.JWT_ACCESS_SECRET;
  if (!access) throw new Error("JWT_ACCESS_SECRET is not configured.");
  return access;
}

export async function aurelinkAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = req.headers.authorization;
    if (!raw?.startsWith("Bearer ")) { res.status(401).json({success:false,message:"Aurelink authentication required."}); return; }
    const payload = jwt.verify(raw.slice(7).trim(), secrets()) as { userId?: string; sessionId?: string; audience?: string };
    if (payload.audience !== "aurelink" || !payload.userId || !payload.sessionId) {
      res.status(401).json({success:false,message:"Invalid Aurelink session."}); return;
    }
    const result = await pool.query(
      `SELECT u.id,u.account_status,s.id AS session_id FROM aurelink_users u
       JOIN aurelink_sessions s ON s.user_id=u.id
       WHERE u.id=$1 AND s.id=$2 AND s.revoked_at IS NULL AND s.expires_at>NOW() AND s.last_activity_at>NOW()-INTERVAL '10 minutes'`,
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
