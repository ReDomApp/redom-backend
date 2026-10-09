import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { pool } from "../database/db";

const router = Router();

function authorized(value: unknown): boolean {
  const expected = process.env.REDOM_OPS_ADMIN_KEY;
  const supplied = typeof value === "string" ? value : "";
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

router.use((req, res, next) => {
  if (!process.env.REDOM_OPS_ADMIN_KEY) {
    return res.status(503).json({ success: false, message: "Operations report archive is disabled until REDOM_OPS_ADMIN_KEY is configured." });
  }
  if (!authorized(req.header("x-redom-ops-key"))) {
    return res.status(401).json({ success: false, message: "Unauthorized." });
  }
  res.setHeader("Cache-Control", "no-store");
  return next();
});

router.get("/reports", async (_req, res) => {
  try {
    const result = await pool.query(`SELECT report_key, period_start, period_end, timezone, status, delivery_status,
      provider_message_id, pdf_sha256, generated_at, delivered_at, attempt_count, error_message, created_at
      FROM redom_ops_report_runs ORDER BY period_end DESC LIMIT 100`);
    return res.json({ success: true, reports: result.rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve operations reports." });
  }
});

router.get("/reports/:reportKey.pdf", async (req, res) => {
  const reportKey = String(req.params.reportKey ?? "");
  if (!/^daily-ops-\d{1,12}$/.test(reportKey)) return res.status(400).json({ success: false, message: "Invalid report key." });
  try {
    const result = await pool.query("SELECT period_end, pdf_base64, pdf_sha256 FROM redom_ops_report_runs WHERE report_key=$1 AND pdf_base64 IS NOT NULL LIMIT 1", [reportKey]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ success: false, message: "Report PDF not found." });
    const pdf = Buffer.from(String(row.pdf_base64), "base64");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="ReDom-Daily-Operations-' + new Date(row.period_end).toISOString().slice(0, 10) + '.pdf"');
    res.setHeader("X-Content-SHA256", String(row.pdf_sha256 ?? ""));
    return res.status(200).send(pdf);
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve operations report PDF." });
  }
});

export default router;
