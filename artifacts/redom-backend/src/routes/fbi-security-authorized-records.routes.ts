import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { pool } from "../database/db";

const router = Router();
const adminKey = () => process.env.REDOM_FBI_SECURITY_ADMIN_KEY?.trim() ?? "";

function requireAdmin(req: any, res: any, next: any): void {
  const expected = adminKey();
  const supplied = req.header("x-redom-fbi-security-key") ?? "";
  if (expected.length < 32) return void res.status(503).json({ success: false, message: "Authorized records integration is disabled until the FBI Security admin secret is configured." });
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  if (!supplied || a.length !== b.length || !timingSafeEqual(a, b)) return void res.status(401).json({ success: false, message: "Unauthorized." });
  res.setHeader("Cache-Control", "no-store");
  next();
}

const ALLOWED_FIELDS = ["case_number", "docket_number", "agency", "court", "case_status", "filing_date", "disposition", "public_record_url", "record_title", "record_date", "public_summary"] as const;
const SENSITIVE_KEY = /ssn|social.?security|tax.?id|tin|itin|dob|birth.?date|home.?address|residential.?address|personal.?phone|personal.?email|bank|credit.?card|account.?number|password|credential|precise.?location|relative|family.?member/i;

function sanitizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => SENSITIVE_KEY.test(key))) throw new Error("Provider response contains a prohibited sensitive field; response discarded.");
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    const v = input[key];
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[key] = String(v).slice(0, key === "public_summary" ? 1500 : 500);
  }
  return out;
}

async function audit(eventType: string, caseId: string | null, metadata: Record<string, unknown>): Promise<void> {
  await pool.query("INSERT INTO redom_fbi_security_audit_events(event_type,record_id,metadata,created_at) VALUES($1,$2,$3::jsonb,now())", [eventType, caseId, JSON.stringify(metadata)]);
}

async function ensureResultSchema(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS redom_fbi_security_authorized_record_results (
    id bigserial PRIMARY KEY,
    case_id text NOT NULL REFERENCES redom_fbi_security_cases(id) ON DELETE CASCADE,
    provider_host text NOT NULL,
    purpose text NOT NULL CHECK (purpose = 'case_corroboration'),
    result_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    retrieved_at timestamptz NOT NULL DEFAULT now(),
    analyst_review_status text NOT NULL DEFAULT 'needs_review' CHECK (analyst_review_status IN ('needs_review','supports_case','contradicts_case','unrelated'))
  )`);
}

router.get("/admin/authorized-records/status", requireAdmin, (_req, res) => {
  const configured = Boolean(process.env.FBI_SECURITY_AUTHORIZED_RECORDS_API_URL?.trim() && process.env.FBI_SECURITY_AUTHORIZED_RECORDS_API_TOKEN?.trim() && process.env.FBI_SECURITY_AUTHORIZED_RECORDS_ALLOWED_HOSTS?.trim());
  return res.json({ success: true, configured, enabled: configured, provider: configured ? "configured-approved-REST-adapter" : null,
    requiredEnvironment: ["FBI_SECURITY_AUTHORIZED_RECORDS_API_URL", "FBI_SECURITY_AUTHORIZED_RECORDS_API_TOKEN", "FBI_SECURITY_AUTHORIZED_RECORDS_ALLOWED_HOSTS"],
    supportedFields: ALLOWED_FIELDS,
    note: "Case-scoped public court/agency metadata only. The adapter does not retrieve SSNs, tax records, financial data, home addresses, relatives, or private account data." });
});

router.post("/admin/cases/:caseId/authorized-records-query", requireAdmin, async (req, res) => {
  const caseId = String(req.params.caseId ?? "").slice(0, 80);
  if (String(req.body?.purpose ?? "").trim() !== "case_corroboration") return res.status(400).json({ success: false, message: "Purpose must be case_corroboration." });
  const endpointRaw = process.env.FBI_SECURITY_AUTHORIZED_RECORDS_API_URL?.trim() ?? "";
  const token = process.env.FBI_SECURITY_AUTHORIZED_RECORDS_API_TOKEN?.trim() ?? "";
  const hosts = (process.env.FBI_SECURITY_AUTHORIZED_RECORDS_ALLOWED_HOSTS ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!endpointRaw || !token || !hosts.length) return res.status(503).json({ success: false, message: "Integration is not configured. Set the approved provider URL, token, and exact host allowlist as secrets in the existing backend environment." });
  let endpoint: URL;
  try { endpoint = new URL(endpointRaw); } catch { return res.status(503).json({ success: false, message: "Configured provider endpoint is invalid." }); }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port || !hosts.includes(endpoint.hostname.toLowerCase())) return res.status(503).json({ success: false, message: "Provider endpoint must use HTTPS and match the explicit host allowlist exactly." });

  try {
    const caseResult = await pool.query("SELECT id,case_number,title,agency,source_url FROM redom_fbi_security_cases WHERE id=$1 LIMIT 1", [caseId]);
    const c = caseResult.rows[0];
    if (!c) return res.status(404).json({ success: false, message: "Case not found." });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response: Response;
    try {
      response = await fetch(endpoint.toString(), {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { authorization: "Bearer " + token, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ purpose: "case_corroboration", caseNumber: c.case_number, subjectOrCaseTitle: String(c.title).slice(0, 300),
          issuingAgency: String(c.agency).slice(0, 200), officialCaseUrl: c.source_url, requestedFields: ALLOWED_FIELDS })
      });
    } finally { clearTimeout(timeout); }

    if (!response.ok) {
      await audit("authorized_records_query_failed", caseId, { providerHost: endpoint.hostname, httpStatus: response.status, purpose: "case_corroboration" });
      return res.status(502).json({ success: false, message: "Approved provider request failed with HTTP " + response.status + "; no result was accepted." });
    }
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > 100_000) {
      await audit("authorized_records_query_rejected", caseId, { providerHost: endpoint.hostname, reason: "response_too_large" });
      return res.status(502).json({ success: false, message: "Provider response exceeded 100 KB and was discarded." });
    }
    const payload = JSON.parse(raw);
    const records = Array.isArray(payload?.records) ? payload.records : (payload?.record ? [payload.record] : []);
    if (records.length > 25) throw new Error("Provider returned more than 25 records; response discarded.");
    const sanitized = records.map(sanitizeRecord);
    await ensureResultSchema();
    const inserted = await pool.query("INSERT INTO redom_fbi_security_authorized_record_results(case_id,provider_host,purpose,result_json) VALUES($1,$2,'case_corroboration',$3::jsonb) RETURNING id,retrieved_at,analyst_review_status",
      [caseId, endpoint.hostname, JSON.stringify(sanitized)]);
    await audit("authorized_records_query_completed", caseId, { providerHost: endpoint.hostname, resultCount: sanitized.length, resultId: inserted.rows[0].id, purpose: "case_corroboration", fieldsReturned: [...new Set(sanitized.flatMap((r: Record<string, unknown>) => Object.keys(r)))], requiresHumanReview: true });
    return res.json({ success: true, resultId: inserted.rows[0].id, retrievedAt: inserted.rows[0].retrieved_at, reviewStatus: inserted.rows[0].analyst_review_status, providerHost: endpoint.hostname, count: sanitized.length, records: sanitized,
      warning: "Provider output is unverified until human review. This adapter only accepts case/docket metadata and public-record links; it is not identity proof." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider integration failed.";
    await audit("authorized_records_query_rejected", caseId, { reason: message.slice(0, 250), purpose: "case_corroboration" });
    return res.status(502).json({ success: false, message: message.includes("prohibited sensitive field") || message.includes("more than 25 records") ? message : "Approved provider integration failed or returned an invalid response. No result was accepted." });
  }
});

router.patch("/admin/authorized-record-results/:resultId/review", requireAdmin, async (req, res) => {
  const id = Number(req.params.resultId);
  const status = String(req.body?.status ?? "");
  const note = String(req.body?.note ?? "").trim().slice(0, 1000);
  if (!Number.isSafeInteger(id) || id < 1 || !["needs_review", "supports_case", "contradicts_case", "unrelated"].includes(status)) return res.status(400).json({ success: false, message: "Invalid result ID or review status." });
  try {
    await ensureResultSchema();
    const updated = await pool.query("UPDATE redom_fbi_security_authorized_record_results SET analyst_review_status=$2 WHERE id=$1 RETURNING id,case_id,provider_host,analyst_review_status,retrieved_at", [id, status]);
    if (!updated.rows[0]) return res.status(404).json({ success: false, message: "Authorized-record result not found." });
    await audit("authorized_records_result_reviewed", String(updated.rows[0].case_id), { resultId: id, status, note, providerHost: updated.rows[0].provider_host });
    return res.json({ success: true, result: updated.rows[0], note, warning: "Analyst assessment is not a legal finding or proof of identity." });
  } catch { return res.status(500).json({ success: false, message: "Unable to update review status." }); }
});

export default router;
