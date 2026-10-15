import { Router } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { pool } from "../database/db";

const router = Router();
const adminKey = () => process.env.REDOM_FBI_SECURITY_ADMIN_KEY?.trim() ?? "";
function requireAdmin(req: any, res: any, next: any): void {
  const expected = adminKey();
  const supplied = req.header("x-redom-fbi-security-key") ?? "";
  if (expected.length < 32) {
    res.status(503).json({ success: false, message: "FBI Security admin access is disabled until REDOM_FBI_SECURITY_ADMIN_KEY is configured." });
    return;
  }
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  if (!supplied || a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ success: false, message: "Unauthorized." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
}
async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS redom_fbi_security_cases (
      id text PRIMARY KEY,
      case_number text,
      source_id text NOT NULL,
      agency text NOT NULL,
      title text NOT NULL,
      category jsonb NOT NULL DEFAULT '[]'::jsonb,
      source_url text NOT NULL UNIQUE,
      published_at timestamptz,
      retrieved_at timestamptz NOT NULL DEFAULT now(),
      content_sha256 text,
      summary text NOT NULL DEFAULT '',
      reward_advertised boolean NOT NULL DEFAULT false,
      reward_amount_text text,
      reward_exact_wording text,
      reward_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
      tip_url text,
      review_status text NOT NULL DEFAULT 'new' CHECK (review_status IN ('new','under_review','verified_public_source','submitted_by_human','closed'))
    );
    ALTER TABLE redom_fbi_security_cases ADD COLUMN IF NOT EXISTS case_number text;
    UPDATE redom_fbi_security_cases SET case_number = 'FBI-' || to_char(COALESCE(published_at, retrieved_at, now()), 'YYYY') || '-' || upper(substr(md5(id), 1, 12)) WHERE case_number IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS redom_fbi_security_cases_case_number_idx ON redom_fbi_security_cases(case_number) WHERE case_number IS NOT NULL;
    CREATE TABLE IF NOT EXISTS redom_fbi_security_audit_events (
      id bigserial PRIMARY KEY,
      event_type text NOT NULL,
      record_id text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS redom_fbi_security_corroborations (
      id bigserial PRIMARY KEY,
      case_id text NOT NULL REFERENCES redom_fbi_security_cases(id) ON DELETE CASCADE,
      source_url text NOT NULL,
      publisher text NOT NULL,
      headline text NOT NULL,
      published_at timestamptz,
      excerpt text NOT NULL DEFAULT '',
      content_sha256 text NOT NULL,
      corroboration_status text NOT NULL DEFAULT 'needs_review' CHECK (corroboration_status IN ('needs_review','supports_notice','contradicts_notice','unrelated')),
      reviewer_note text,
      retrieved_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(case_id, source_url)
    );
    CREATE INDEX IF NOT EXISTS redom_fbi_security_corroborations_case_idx
      ON redom_fbi_security_corroborations(case_id, retrieved_at DESC);
  `);
}
const newsHosts = new Set([
  "apnews.com", "www.apnews.com", "reuters.com", "www.reuters.com",
  "abcnews.go.com", "www.cbsnews.com", "www.nbcnews.com", "www.pbs.org",
  "www.npr.org", "www.cnn.com", "www.nytimes.com", "www.washingtonpost.com",
  "www.wsj.com", "www.bloomberg.com", "www.usatoday.com", "www.latimes.com",
  "www.theguardian.com", "www.bbc.com", "www.bbc.co.uk"
]);
const officialHosts = new Set([
  "www.fbi.gov", "www.justice.gov", "www.sec.gov", "www.ftc.gov",
  "www.usmarshals.gov", "www.consumerfinance.gov", "www.cftc.gov", "www.fdic.gov"
]);
function allowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return newsHosts.has(h) || officialHosts.has(h);
}
function cleanText(s: string, max: number): string {
  return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim().slice(0, max);
}
function meta(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp('<meta[^>]+(?:property|name)=["\\']' + escaped + '["\\'][^>]+content=["\\']([^"\\']*)["\\'][^>]*>', "i"),
    new RegExp('<meta[^>]+content=["\\']([^"\\']*)["\\'][^>]+(?:property|name)=["\\']' + escaped + '["\\'][^>]*>', "i")
  ];
  for (const re of patterns) { const m = html.match(re); if (m?.[1]) return cleanText(m[1], 2000); }
  return "";
}
async function audit(eventType: string, caseId: string, metadata: Record<string, unknown>): Promise<void> {
  await pool.query(
    "INSERT INTO redom_fbi_security_audit_events(event_type,record_id,metadata,created_at) VALUES($1,$2,$3::jsonb,now())",
    [eventType, caseId, JSON.stringify(metadata)]
  );
}

/** Store source-linked corroboration evidence scoped to exactly one public case. */
router.post("/admin/cases/:caseId/corroborations", requireAdmin, async (req, res) => {
  const caseId = String(req.params.caseId ?? "").trim().slice(0, 80);
  const rawUrl = String(req.body?.sourceUrl ?? "").trim();
  if (!rawUrl || rawUrl.length > 2000) return res.status(400).json({ success: false, message: "A public sourceUrl is required." });
  let url: URL;
  try { url = new URL(rawUrl); } catch { return res.status(400).json({ success: false, message: "Invalid source URL." }); }
  if (url.protocol !== "https:" || !allowedHost(url.hostname) || url.username || url.password || url.port || url.hash) {
    return res.status(400).json({ success: false, message: "Only HTTPS URLs on the registered official/news allowlist are accepted." });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    await ensureSchema();
    const exists = await pool.query("SELECT id,case_number,title,source_url FROM redom_fbi_security_cases WHERE id=$1", [caseId]);
    if (!exists.rows[0]) return res.status(404).json({ success: false, message: "Case not found; corroboration cannot be attached to another case." });
    const response = await fetch(url.toString(), {
      method: "GET", redirect: "manual", signal: controller.signal,
      headers: { "User-Agent": "ReDom-FBI-Security-PublicSourceReview/1.0", "Accept": "text/html,application/xhtml+xml" }
    });
    if (response.status >= 300 && response.status < 400) return res.status(400).json({ success: false, message: "Redirects are not followed; submit the final allowlisted HTTPS URL." });
    if (!response.ok) return res.status(502).json({ success: false, message: "The public source could not be retrieved.", sourceStatus: response.status });
    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) return res.status(415).json({ success: false, message: "The source must return HTML." });
    const reader = response.body?.getReader();
    if (!reader) return res.status(502).json({ success: false, message: "The source response was empty." });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_500_000) { await reader.cancel(); return res.status(413).json({ success: false, message: "Public source exceeds the 1.5 MB limit." }); }
      chunks.push(value);
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    const headline = meta(html, "og:title") || cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "", 500);
    const publisher = meta(html, "og:site_name") || url.hostname.replace(/^www\./, "");
    const publishedRaw = meta(html, "article:published_time") || meta(html, "datePublished") || meta(html, "pubdate");
    const parsedDate = publishedRaw ? new Date(publishedRaw) : null;
    const publishedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null;
    const excerpt = meta(html, "og:description") || meta(html, "description");
    if (!headline) return res.status(422).json({ success: false, message: "Could not extract a headline. No evidence record was created." });
    const contentSha256 = createHash("sha256").update([url.toString(), headline, publisher, publishedAt ?? "", excerpt].join("\n")).digest("hex");
    const saved = await pool.query(
      `INSERT INTO redom_fbi_security_corroborations(case_id,source_url,publisher,headline,published_at,excerpt,content_sha256)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(case_id,source_url) DO UPDATE SET publisher=EXCLUDED.publisher,headline=EXCLUDED.headline,
       published_at=EXCLUDED.published_at,excerpt=EXCLUDED.excerpt,content_sha256=EXCLUDED.content_sha256,
       retrieved_at=now(),corroboration_status='needs_review'
       RETURNING id,case_id,source_url,publisher,headline,published_at,excerpt,content_sha256,corroboration_status,retrieved_at`,
      [caseId, url.toString(), publisher, headline, publishedAt, excerpt, contentSha256]
    );
    await audit("public_source_corroboration_added", caseId, { corroborationId: saved.rows[0].id, sourceUrl: url.toString(), publisher, contentSha256 });
    return res.status(201).json({ success: true, case: { id: exists.rows[0].id, caseNumber: exists.rows[0].case_number, title: exists.rows[0].title }, corroboration: saved.rows[0], warning: "Metadata is source-linked but not proof of the underlying allegation. An analyst must independently determine whether it supports, contradicts, or is unrelated to the official notice." });
  } catch (error) {
    return res.status(error instanceof Error && error.name === "AbortError" ? 504 : 502).json({ success: false, message: "Unable to retrieve or store corroboration source." });
  } finally {
    clearTimeout(timeout);
  }
});

router.get("/cases/:caseId/corroborations", async (req, res) => {
  const caseId = String(req.params.caseId ?? "").trim().slice(0, 80);
  try {
    await ensureSchema();
    const c = await pool.query("SELECT id,case_number,title FROM redom_fbi_security_cases WHERE id=$1", [caseId]);
    if (!c.rows[0]) return res.status(404).json({ success: false, message: "Case not found." });
    const rows = await pool.query(
      "SELECT id,case_id,source_url,publisher,headline,published_at,excerpt,content_sha256,corroboration_status,reviewer_note,retrieved_at FROM redom_fbi_security_corroborations WHERE case_id=$1 ORDER BY retrieved_at DESC LIMIT 100",
      [caseId]
    );
    await audit("public_source_corroborations_viewed", caseId, { count: rows.rows.length });
    return res.setHeader("Cache-Control", "no-store").json({ success: true, case: c.rows[0], corroborations: rows.rows, reviewRequired: rows.rows.some((x: any) => x.corroboration_status === "needs_review") });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve corroboration evidence." });
  }
});

router.patch("/admin/cases/:caseId/corroborations/:corroborationId", requireAdmin, async (req, res) => {
  const caseId = String(req.params.caseId ?? "").trim().slice(0, 80);
  const id = Number(req.params.corroborationId);
  const status = String(req.body?.status ?? "");
  const note = String(req.body?.reviewerNote ?? "").replace(/\s+/g, " ").trim().slice(0, 1500);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Invalid corroboration ID." });
  if (!["needs_review", "supports_notice", "contradicts_notice", "unrelated"].includes(status)) return res.status(400).json({ success: false, message: "Unsupported corroboration status." });
  if (/\b(?:SSN|social security number|TIN|taxpayer identification|bank account|routing number|password|access token)\b/i.test(note)) return res.status(400).json({ success: false, message: "Reviewer notes must not contain restricted identity, financial, or credential data." });
  try {
    await ensureSchema();
    const result = await pool.query(
      "UPDATE redom_fbi_security_corroborations SET corroboration_status=$3,reviewer_note=$4 WHERE id=$1 AND case_id=$2 RETURNING id,case_id,source_url,publisher,headline,published_at,excerpt,content_sha256,corroboration_status,reviewer_note,retrieved_at",
      [id, caseId, status, note || null]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: "Corroboration not found for this exact case." });
    await audit("public_source_corroboration_reviewed", caseId, { corroborationId: id, status });
    return res.json({ success: true, corroboration: result.rows[0] });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to update corroboration review." });
  }
});

router.get("/cases/:caseId/verification-report", async (req, res) => {
  const caseId = String(req.params.caseId ?? "").trim().slice(0, 80);
  try {
    await ensureSchema();
    const c = await pool.query("SELECT id,case_number,agency,title,source_url,published_at,retrieved_at,content_sha256,summary,reward_advertised,reward_amount_text,review_status FROM redom_fbi_security_cases WHERE id=$1", [caseId]);
    if (!c.rows[0]) return res.status(404).json({ success: false, message: "Case not found." });
    const evidence = await pool.query("SELECT publisher,headline,source_url,published_at,excerpt,content_sha256,corroboration_status,reviewer_note,retrieved_at FROM redom_fbi_security_corroborations WHERE case_id=$1 ORDER BY retrieved_at DESC LIMIT 100", [caseId]);
    const row = c.rows[0];
    const report = [
      "# Public-source verification report", "",
      "> Draft for human review. Corroboration metadata does not establish guilt or prove an allegation.", "",
      "## Primary public notice",
      `- Case number: ${row.case_number ?? "Not assigned"}`,
      `- Agency: ${row.agency}`, `- Notice: ${row.title}`, `- URL: ${row.source_url}`,
      `- Published: ${row.published_at ?? "Not stated"}`, `- Retrieved: ${row.retrieved_at}`,
      `- Review status: ${row.review_status}`, `- Content SHA-256: ${row.content_sha256 ?? "Not recorded"}`,
      `- Summary: ${String(row.summary ?? "").slice(0, 3000)}`, "",
      "## Independent public-source corroboration",
      ...(evidence.rows.length ? evidence.rows.flatMap((e: any, i: number) => [
        `### ${i + 1}. ${e.headline}`, `- Publisher: ${e.publisher}`, `- URL: ${e.source_url}`,
        `- Published: ${e.published_at ?? "Not available"}`, `- Retrieved: ${e.retrieved_at}`,
        `- Analyst assessment: ${e.corroboration_status}`, `- Note: ${e.reviewer_note ?? "No reviewer note"}`,
        `- Metadata excerpt: ${String(e.excerpt ?? "").slice(0, 1000)}`, `- SHA-256: ${e.content_sha256}`, ""
      ]) : ["No corroboration sources have been recorded.", ""]),
      "## Review checks",
      "- Confirm every source URL, publication date, headline, and publisher against the live page.",
      "- Confirm independent reporting is genuinely about this exact notice/case, not merely a similar name or allegation.",
      "- Record contradictory evidence and uncertainties; do not infer identity from name similarity.",
      "- Do not combine records: this report is scoped to one exact case ID.",
      "- Human approval is required before any external reporting or official submission.",
      "", "Public-source evidence only. This module does not retrieve SSNs, tax files, bank records, private account history, or private identifiers."
    ].join("\n");
    await audit("verification_report_generated", caseId, { corroborationCount: evidence.rows.length });
    return res.type("text/markdown").setHeader("Cache-Control", "no-store").send(report);
  } catch {
    return res.status(500).json({ success: false, message: "Unable to generate verification report." });
  }
});

export default router;
