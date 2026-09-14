import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { pool } from "../database/db";
import { db } from "../database/db";
import { activityLog } from "../database/activityLog";

const router = Router();

router.get("/", authMiddleware, authRateLimit, async (req, res) => {
  if (!req.user?.userId) { res.status(401).json({ success: false, message: "Authentication required." }); return; }
  const query = String(req.query.q ?? "").trim();
  if (query.length < 1 || query.length > 100) { res.status(400).json({ success: false, message: "Enter a search term." }); return; }
  const like = `%${query.replace(/[%_\\]/g, "\\$&").replace(/'/g, "''")}%`;
  const result = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.public_id, u.profile_id, p.profile_photo, p.verified
       FROM users u
       JOIN user_profiles p ON p.user_id = u.id
      WHERE p.profile_visibility = 'public'
        AND (u.username ILIKE $1 ESCAPE '\\' OR u.first_name ILIKE $1 ESCAPE '\\' OR u.last_name ILIKE $1 ESCAPE '\\' OR p.display_name ILIKE $1 ESCAPE '\\')
      ORDER BY CASE WHEN lower(u.username) = lower($2) THEN 0 ELSE 1 END, u.username ASC
      LIMIT 50`,
    [like, query.replace(/^@/, "")],
  );
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "search", activityCategory: "search", activityTitle: "Search performed", activityDescription: "A ReDom search was performed.", status: "success", triggeredBy: "user", source: "app", undoSupported: false, hidden: true, archived: false });
  res.json({ success: true, query, results: result.rows.map((row) => ({ userId: row.id, firstName: row.first_name, lastName: row.last_name, username: row.username, publicId: row.public_id, profileId: row.profile_id, profilePhoto: row.profile_photo, verified: row.verified })) });
});

export default router;
