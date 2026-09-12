import type { NextFunction, Request, Response } from "express";
import { pool } from "../database/db";

const DEFAULT_PROFILE_PHOTO = "__redom_default__";
let lastSweep = 0;

export async function profileMediaExpiryMiddleware(_req: Request, _res: Response, next: NextFunction) {
  const now = Date.now();
  if (now - lastSweep > 30_000) {
    lastSweep = now;
    try {
      await pool.query(`UPDATE user_profiles SET profile_photo=COALESCE(profile_photo_previous,$1), profile_photo_previous=NULL, profile_photo_expires_at=NULL, updated_at=NOW() WHERE profile_photo_expires_at IS NOT NULL AND profile_photo_expires_at <= NOW()`, [DEFAULT_PROFILE_PHOTO]);
      await pool.query(`UPDATE profile_media_history SET archived_at=NOW() WHERE temporary_until IS NOT NULL AND temporary_until <= NOW() AND archived_at IS NULL`);
    } catch {
      // Expiry cleanup is best-effort; never block profile/feed requests.
    }
  }
  next();
}
