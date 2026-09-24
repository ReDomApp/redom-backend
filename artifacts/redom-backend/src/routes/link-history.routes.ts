import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { pool } from "../database/db";

const router = Router();

const recordSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().trim().max(200).optional().nullable(),
  source: z.string().trim().max(80).optional().nullable(),
});

router.get("/", authMiddleware, async (req, res) => {
  const id = req.user?.userId;
  if (!id) return res.status(401).json({ success: false, message: "Authentication required." });
  const result = await pool.query(
    `SELECT id, url, title, domain, source, opened_at
       FROM link_history
      WHERE user_id = $1
      ORDER BY opened_at DESC
      LIMIT 200`,
    [id],
  );
  return res.json({ success: true, links: result.rows.map((row) => ({
    id: String(row.id), url: String(row.url), title: row.title ? String(row.title) : null,
    domain: String(row.domain), source: row.source ? String(row.source) : null,
    openedAt: new Date(String(row.opened_at)).toISOString(),
  })) });
});

router.post("/", authMiddleware, async (req, res) => {
  const id = req.user?.userId;
  if (!id) return res.status(401).json({ success: false, message: "Authentication required." });
  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid link history entry." });
  const url = new URL(parsed.data.url);
  if (!["http:", "https:"].includes(url.protocol)) return res.status(400).json({ success: false, message: "Only web links can be recorded." });
  const domain = url.hostname.toLowerCase().replace(/^www\./, "");
  const result = await pool.query(
    `INSERT INTO link_history (user_id, url, title, domain, source)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, opened_at`,
    [id, parsed.data.url, parsed.data.title ?? null, domain, parsed.data.source ?? "app"],
  );
  return res.status(201).json({ success: true, id: String(result.rows[0].id), openedAt: new Date(String(result.rows[0].opened_at)).toISOString() });
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const id = req.user?.userId;
  if (!id) return res.status(401).json({ success: false, message: "Authentication required." });
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid link history entry." });
  await pool.query(`DELETE FROM link_history WHERE id = $1 AND user_id = $2`, [parsed.data, id]);
  return res.json({ success: true });
});

router.delete("/", authMiddleware, async (req, res) => {
  const id = req.user?.userId;
  if (!id) return res.status(401).json({ success: false, message: "Authentication required." });
  await pool.query(`DELETE FROM link_history WHERE user_id = $1`, [id]);
  return res.json({ success: true });
});

export default router;
