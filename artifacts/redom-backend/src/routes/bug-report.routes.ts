import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { submitBugReport } from "../services/bug-report.service";

const router = Router();

const attachmentSchema = z.object({
  filename: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(1).max(100),
  data: z.string().min(20).max(14_000_000),
});

const reportSchema = z.object({
  product: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(3).max(12_000),
  includeDiagnostics: z.boolean().default(false),
  diagnostics: z.record(z.string(), z.unknown()).nullable().optional(),
  attachments: z.array(attachmentSchema).max(3).default([]),
}).strict();

router.post("/", authMiddleware, async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid problem report.", details: parsed.error.flatten() });
  try {
    const report = await submitBugReport({
      userId: req.user!.userId,
      product: parsed.data.product,
      category: parsed.data.category,
      description: parsed.data.description,
      includeDiagnostics: parsed.data.includeDiagnostics,
      diagnostics: parsed.data.includeDiagnostics ? parsed.data.diagnostics ?? null : null,
      attachments: parsed.data.attachments,
    });
    return res.status(201).json({
      success: true,
      report: {
        reportId: report.reportId,
        product: report.product,
        category: report.category,
        status: report.status,
        emailStatus: report.emailStatus,
        submittedAt: report.submittedAt,
      },
    });
  } catch (error) {
    req.log?.error?.({ err: error }, "Technical problem report failed");
    return res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to submit the problem report." });
  }
});

router.get("/:reportId", authMiddleware, async (req, res) => {
  const reportId = String(req.params.reportId);
  if (!/^\d{6,11}$/.test(reportId)) return res.status(400).json({ success: false, message: "Invalid report ID." });
  const result = await import("../database/db").then(({ pool }) => pool.query(
    `SELECT report_id, product, category, description, fix_required, status, email_status, submitted_at, emailed_at
     FROM bug_reports WHERE report_id=$1 AND user_id=$2 LIMIT 1`,
    [reportId, req.user!.userId],
  ));
  if (!result.rowCount) return res.status(404).json({ success: false, message: "Report not found." });
  return res.json({ success: true, report: result.rows[0] });
});

export default router;
