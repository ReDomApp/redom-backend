import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { pool } from "../database/db";
import { env } from "../config/env";

const router = Router();
const PRIVACY = new Set(["public", "friends_of_friends", "friends", "only_me", "custom"]);

router.use(authMiddleware);

router.get("/", async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT u.first_name,u.last_name,u.date_of_birth,u.gender,
            p.bio,p.current_city,p.hometown,p.bio_privacy,p.current_city_privacy,
            p.hometown_privacy,p.birthday_month_day_privacy,p.birthday_year_privacy
       FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1 LIMIT 1`,
    [req.user.userId],
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: "Profile not found." });
  const p = result.rows[0];
  return res.json({
    success: true,
    profile: {
      firstName: p.first_name, lastName: p.last_name, bio: p.bio || "",
      currentCity: p.current_city || "", hometown: p.hometown || "",
      birthday: p.date_of_birth, gender: p.gender,
      bioPrivacy: p.bio_privacy, currentCityPrivacy: p.current_city_privacy,
      hometownPrivacy: p.hometown_privacy,
      birthdayMonthDayPrivacy: p.birthday_month_day_privacy,
      birthdayYearPrivacy: p.birthday_year_privacy,
    },
  });
});

router.patch("/details", async (req: Request, res: Response) => {
  const allowed = new Set(["bio", "current_city", "hometown", "bio_privacy", "current_city_privacy", "hometown_privacy", "birthday_month_day_privacy", "birthday_year_privacy"]);
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(req.body || {})) {
    if (!allowed.has(key)) continue;
    if (key.endsWith("privacy") && (typeof value !== "string" || !PRIVACY.has(value))) continue;
    if (["bio", "current_city", "hometown"].includes(key) && typeof value !== "string") continue;
    fields.push(`${key}=$${values.length + 1}`); values.push(typeof value === "string" ? value.trim() : value);
  }
  if (!fields.length) return res.status(400).json({ success: false, message: "No editable profile fields were supplied." });
  fields.push(`updated_at=NOW()`);
  const result = await pool.query(`UPDATE user_profiles SET ${fields.join(",")} WHERE user_id=$${values.length + 1} RETURNING user_id`, [...values, req.user.userId]);
  if (!result.rowCount) return res.status(404).json({ success: false, message: "Profile not found." });
  return res.json({ success: true });
});

router.get("/locations", async (req: Request, res: Response) => {
  const query = String(req.query.q || "").trim();
  if (query.length < 3) return res.json({ success: true, results: [] });
  try {
    const url = new URL("https://api.mapbox.com/geocoding/v5/mapbox.places/" + encodeURIComponent(query) + ".json");
    url.searchParams.set("access_token", env.mapbox.accessToken);
    url.searchParams.set("autocomplete", "true");
    url.searchParams.set("limit", "8");
    url.searchParams.set("types", "place,locality,neighborhood,region,country");
    const response = await fetch(url);
    if (!response.ok) return res.status(502).json({ success: false, message: "Location search is temporarily unavailable." });
    const data = await response.json() as { features?: Array<{ id: string; text: string; place_name: string; center?: [number, number] }> };
    return res.json({ success: true, results: (data.features || []).map((f) => ({ id: f.id, name: f.text, placeName: f.place_name, longitude: f.center?.[0] ?? null, latitude: f.center?.[1] ?? null })) });
  } catch {
    return res.status(502).json({ success: false, message: "Location search is temporarily unavailable." });
  }
});

export default router;
