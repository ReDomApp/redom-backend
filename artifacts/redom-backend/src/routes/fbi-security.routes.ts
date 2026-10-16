import { Router } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { pool } from "../database/db";

/**
 * ReDom FBI Security reporting feature.
 * Mounted on the existing ReDom backend API; public-source records only.
 * Admin routes require a separate high-entropy secret until delegated ReDom RBAC
 * policy is explicitly configured. This is not an official government service.
 */
const router = Router();
const MAX_LIMIT = 200;
const ADMIN_KEY = () => process.env.REDOM_FBI_SECURITY_ADMIN_KEY?.trim() ?? "";

function requireFbiSecurityAdmin(req: any, res: any, next: any): void {
  const expected = ADMIN_KEY();
  const supplied = req.header("x-redom-fbi-security-key") ?? "";
  if (expected.length < 32) {
    res.status(503).json({ success: false, message: "FBI Security reporting admin access is disabled until REDOM_FBI_SECURITY_ADMIN_KEY is configured." });
    return;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (!supplied || a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ success: false, message: "Unauthorized." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
}

function boundedLimit(value: unknown, fallback = 50): number {
  const n = Number(value ?? fallback);
  return Number.isInteger(n) ? Math.max(1, Math.min(MAX_LIMIT, n)) : fallback;
}


async function audit(eventType: string, recordId: string | null, metadata: Record<string, unknown> = {}): Promise<void> {
  await pool.query(
    `INSERT INTO redom_fbi_security_audit_events (event_type, record_id, metadata, created_at)
     VALUES ($1, $2, $3::jsonb, now())`,
    [eventType, recordId, JSON.stringify(metadata)]
  );
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
    CREATE INDEX IF NOT EXISTS redom_fbi_security_cases_retrieved_idx ON redom_fbi_security_cases (retrieved_at DESC);
    CREATE INDEX IF NOT EXISTS redom_fbi_security_cases_reward_idx ON redom_fbi_security_cases (reward_advertised, retrieved_at DESC);
    CREATE TABLE IF NOT EXISTS redom_fbi_security_audit_events (
      id bigserial PRIMARY KEY,
      event_type text NOT NULL,
      record_id text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS redom_fbi_security_analyst_notes (
      id bigserial PRIMARY KEY,
      case_id text NOT NULL REFERENCES redom_fbi_security_cases(id) ON DELETE CASCADE,
      analyst_label text NOT NULL DEFAULT 'analyst',
      note text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

router.get("/health", async (_req, res) => {
  try {
    await ensureSchema();
    const result = await pool.query("SELECT count(*)::int AS cases FROM redom_fbi_security_cases");
    res.setHeader("Cache-Control", "no-store");
    return res.json({ success: true, feature: "fbi-security-public-reporting", sourceOfTruth: "ReDom backend PostgreSQL", cases: result.rows[0]?.cases ?? 0 });
  } catch {
    return res.status(503).json({ success: false, message: "FBI Security reporting feature unavailable." });
  }
});

router.get("/sources", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({ success: true, mode: "public-source-only", sources: [
    { id: "fbi_wanted", agency: "Federal Bureau of Investigation", homepage: "https://www.fbi.gov/wanted", tipUrl: "https://tips.fbi.gov/" },
    { id: "doj_news", agency: "U.S. Department of Justice", homepage: "https://www.justice.gov/news", tipUrl: "https://www.justice.gov/" },
    { id: "sec_litigation", agency: "U.S. Securities and Exchange Commission", homepage: "https://www.sec.gov/litigation", tipUrl: "https://www.sec.gov/tcr" },
    { id: "ftc_news", agency: "Federal Trade Commission", homepage: "https://www.ftc.gov/news-events/news", tipUrl: "https://reportfraud.ftc.gov/" },
    { id: "usmarshals_fugitives", agency: "U.S. Marshals Service", homepage: "https://www.usmarshals.gov/what-we-do/fugitive-investigations", tipUrl: "https://www.usmarshals.gov/" }
  ]});
});

router.get("/cases", async (req, res) => {
  try {
    await ensureSchema();
    const search = String(req.query.q ?? "").trim().slice(0, 150);
    const rewardOnly = String(req.query.reward_only ?? "false") === "true";
    const limit = boundedLimit(req.query.limit, 50);
    const clauses: string[] = [];
    const args: unknown[] = [];
    if (search) {
      args.push(search.toLocaleLowerCase("en-US"));
      clauses.push(`(position($${args.length} in lower(title)) > 0 OR position($${args.length} in lower(agency)) > 0 OR position($${args.length} in lower(summary)) > 0)`);
    }
    if (rewardOnly) clauses.push("reward_advertised = true");
    args.push(limit);
    const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
    const result = await pool.query(
      `SELECT id, case_number, source_id, agency, title, category, source_url, published_at, retrieved_at,
       content_sha256, summary, reward_advertised, reward_amount_text, reward_exact_wording,
       reward_conditions, tip_url, review_status
       FROM redom_fbi_security_cases ${where ? where + ' AND ' : 'WHERE '}source_id <> 'excluded_index' ORDER BY retrieved_at DESC LIMIT ${args.length}`,
      args
    );
    res.setHeader("Cache-Control", "no-store");
    return res.json({ success: true, count: result.rowCount ?? result.rows.length, cases: result.rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve public case notices." });
  }
});

router.get("/cases/number/:caseNumber", async (req, res) => {
  try {
    await ensureSchema();
    const caseNumber = String(req.params.caseNumber ?? "").trim().toUpperCase().slice(0, 40);
    const result = await pool.query("SELECT * FROM redom_fbi_security_cases WHERE upper(case_number)=$1 LIMIT 1", [caseNumber]);
    if (!result.rows[0]) return res.status(404).json({ success: false, message: "Case number not found." });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ success: true, case: result.rows[0], reportUrl: "/redom-backend/fbi-security/cases/" + encodeURIComponent(result.rows[0].id) + "/report" });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve case number." });
  }
});

router.get("/cases/:caseId", async (req, res) => {
  try {
    await ensureSchema();
    const id = String(req.params.caseId ?? "").slice(0, 80);
    const result = await pool.query("SELECT * FROM redom_fbi_security_cases WHERE id=$1 LIMIT 1", [id]);
    if (!result.rows[0]) return res.status(404).json({ success: false, message: "Public notice not found." });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ success: true, case: result.rows[0] });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve public notice." });
  }
});

router.get("/cases/:caseId/report", async (req, res) => {
  try {
    await ensureSchema();
    const id = String(req.params.caseId ?? "").slice(0, 80);
    const result = await pool.query("SELECT * FROM redom_fbi_security_cases WHERE id=$1 LIMIT 1", [id]);
    const c = result.rows[0];
    if (!c) return res.status(404).json({ success: false, message: "Public notice not found." });
    await audit("report_generated", id);
    const report = [
      "# Public-Source Case Intelligence Report",
      "",
      "> Independent draft for analyst review; this is not an official government document.",
      "",
      "## Case",
      `- Agency: ${c.agency}`,
      `- Title: ${c.title}`,
      `- Case number: ${c.case_number ?? "Not assigned"}`,
      `- Record ID: ${c.id}`,
      `- Review status: ${c.review_status}`,
      `- Published: ${c.published_at ?? "Not available"}`,
      `- Retrieved: ${c.retrieved_at}`,
      `- Official source: ${c.source_url}`,
      "",
      "## Reward",
      `- Detected by heuristic: ${c.reward_advertised ? "yes — verify the current official terms" : "not confirmed"}`,
      `- Extracted amount text: ${c.reward_amount_text ?? "unknown"}`,
      `- Context: ${c.reward_exact_wording ?? "No exact reward context extracted; verify original page."}`,
      `- Potential conditions: ${JSON.stringify(c.reward_conditions ?? [])}`,
      "",
      "## Public notice excerpt",
      String(c.summary ?? "").slice(0, 5000),
      "",
      "## Evidence provenance",
      `- Content SHA-256: ${c.content_sha256 ?? "not recorded"}`,
      `- Official submission destination: ${c.tip_url ?? "consult the agency source"}`,
      "",
      "## Required human review",
      "- Open the original source and verify the notice is current.",
      "- Verify reward terms directly with the issuing agency.",
      "- Separate facts from assumptions and preserve source links.",
      "- Submit directly through the official channel only after human review.",
      "",
      "This report contains public-source information only. Do not add restricted identity, tax, financial, credential, or private-account data."
    ].join("\n");
    res.type("text/markdown").setHeader("Cache-Control", "no-store");
    return res.send(report);
  } catch {
    return res.status(500).json({ success: false, message: "Unable to generate public-source report." });
  }
});

router.get("/correlations", async (req, res) => {
  try {
    await ensureSchema();
    const limit = boundedLimit(req.query.limit, 150);
    const { rows } = await pool.query(
      "SELECT id, title, summary, source_url, content_sha256 FROM redom_fbi_security_cases ORDER BY retrieved_at DESC LIMIT $1",
      [limit]
    );
    const groups = new Map<string, Set<string>>();
    const add = (kind: string, key: string, id: string) => {
      const groupKey = kind + "|" + key;
      if (!groups.has(groupKey)) groups.set(groupKey, new Set());
      groups.get(groupKey)!.add(id);
    };
    for (const item of rows) {
      if (item.content_sha256) add("identical_content", String(item.content_sha256), String(item.id));
      const text = String(item.title ?? "") + " " + String(item.summary ?? "");
      const matches = text.match(/\b(?:case|docket|indictment|complaint|release)\s*(?:no\.?|number|#|:)?\s*[A-Z]{1,8}[-/ ]?\d{2,}(?:[-/]\d+)*\b/gi) ?? [];
      for (const match of matches) add("explicit_public_case_id", match.toUpperCase().replace(/\s+/g, "-"), String(item.id));
      const title = String(item.title ?? "").toLocaleLowerCase("en-US").replace(/[^a-z0-9 ]+/g, " ").trim().replace(/\s+/g, " ");
      if (title.length >= 18) add("exact_normalized_title", title, String(item.id));
    }
    const candidates = [...groups.entries()].map(([groupKey, ids]) => {
      const [matchType, matchKey] = groupKey.split("|");
      return { matchType, matchKey, caseIds: [...ids].sort(), requiresHumanReview: true };
    }).filter(g => g.caseIds.length > 1);
    await audit("correlations_viewed", null, { candidates: candidates.length });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ success: true, candidates, warning: "Candidate correlation only; not proof of identity, conduct, or guilt." });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to correlate public notices." });
  }
});

router.post("/admin/ingest-url", requireFbiSecurityAdmin, async (req, res) => {
  const rawUrl = String(req.body?.url ?? "").trim();
  let url: URL;
  try { url = new URL(rawUrl); } catch { return res.status(400).json({ success: false, message: "Invalid source URL." }); }
  const sources: Record<string, { id: string; agency: string; tipUrl: string }> = {
    "www.fbi.gov": { id: "fbi_wanted", agency: "Federal Bureau of Investigation", tipUrl: "https://tips.fbi.gov/" },
    "tips.fbi.gov": { id: "fbi_tips", agency: "Federal Bureau of Investigation", tipUrl: "https://tips.fbi.gov/" },
    "www.justice.gov": { id: "doj_news", agency: "U.S. Department of Justice", tipUrl: "https://www.justice.gov/" },
    "www.sec.gov": { id: "sec_litigation", agency: "U.S. Securities and Exchange Commission", tipUrl: "https://www.sec.gov/tcr" },
    "www.ftc.gov": { id: "ftc_news", agency: "Federal Trade Commission", tipUrl: "https://reportfraud.ftc.gov/" },
    "reportfraud.ftc.gov": { id: "ftc_report", agency: "Federal Trade Commission", tipUrl: "https://reportfraud.ftc.gov/" },
    "www.usmarshals.gov": { id: "us_marshals_fugitives", agency: "U.S. Marshals Service", tipUrl: "https://www.usmarshals.gov/what-we-do/fugitive-investigations" }
  };
  const source = sources[url.hostname.toLowerCase()];
  if (url.protocol !== "https:" || !source || url.username || url.password || url.port) {
    return res.status(400).json({ success: false, message: "Only HTTPS URLs on registered official source hosts are accepted." });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url.toString(), {
      method: "GET", redirect: "manual", signal: controller.signal,
      headers: { "user-agent": "ReDom-Public-Notice-Monitor/1.0", "accept": "text/html,application/xhtml+xml,application/xml,text/plain" }
    });
    if (response.status >= 300 && response.status < 400) return res.status(400).json({ success: false, message: "Official source redirected. Verify the destination manually before importing." });
    if (!response.ok) return res.status(502).json({ success: false, message: "Official source returned HTTP " + response.status + "." });
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!/(text\/html|application\/xhtml\+xml|application\/(?:rss\+xml|atom\+xml|xml)|text\/plain)/.test(contentType)) return res.status(415).json({ success: false, message: "Unsupported source content type." });
    const announcedSize = Number(response.headers.get("content-length") ?? 0);
    if (announcedSize > 2_000_000) return res.status(413).json({ success: false, message: "Source response exceeds the 2 MB limit." });
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > 2_000_000) return res.status(413).json({ success: false, message: "Source response exceeds the 2 MB limit." });
    const safeMarkup = raw.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg|iframe|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
    const textFrom = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
    const titleMatch = safeMarkup.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
    const title = (titleMatch ? textFrom(titleMatch[1]) : url.hostname + " official public notice").slice(0, 500);
    const summary = textFrom(safeMarkup).slice(0, 10000);
    if (summary.length < 40) return res.status(422).json({ success: false, message: "No usable text extracted. Import a case-specific official notice URL." });
    const rewardMatch = summary.match(/.{0,160}(?:reward|up to\s*\$\s?[0-9][0-9,]*).{0,240}/i);
    const exact = rewardMatch ? rewardMatch[0].trim().slice(0, 600) : null;
    const amount = exact?.match(/(?:up to\s*)?\$\s?[0-9][0-9,]*(?:\.\d{2})?/i)?.[0]?.trim() ?? null;
    const rewardAdvertised = Boolean(exact && amount && /reward|offering|offers/i.test(exact));
    const canonicalUrl = url.toString().split("#")[0];
    const id = createHash("sha256").update(source.id + "|" + canonicalUrl).digest("hex").slice(0, 24);
    const contentHash = createHash("sha256").update(summary, "utf8").digest("hex");
    await ensureSchema();
    const result = await pool.query(
      `INSERT INTO redom_fbi_security_cases (id,source_id,agency,title,category,source_url,retrieved_at,content_sha256,summary,reward_advertised,reward_amount_text,reward_exact_wording,reward_conditions,tip_url,review_status)
       VALUES ($1,$2,$3,$4,'[]'::jsonb,$5,now(),$6,$7,$8,$9,$10,'[]'::jsonb,$11,'new')
       ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,retrieved_at=now(),content_sha256=EXCLUDED.content_sha256,summary=EXCLUDED.summary,reward_advertised=EXCLUDED.reward_advertised,reward_amount_text=EXCLUDED.reward_amount_text,reward_exact_wording=EXCLUDED.reward_exact_wording,tip_url=EXCLUDED.tip_url
       RETURNING id,source_id,agency,title,source_url,retrieved_at,content_sha256,reward_advertised,reward_amount_text,review_status`,
      [id, source.id, source.agency, title, canonicalUrl, contentHash, summary, rewardAdvertised, amount, exact, source.tipUrl]
    );
    await audit("official_source_url_ingested", id, { sourceId: source.id, sourceUrl: canonicalUrl, contentType, contentSha256: contentHash });
    return res.status(201).json({ success: true, case: result.rows[0], warnings: ["Reward extraction is heuristic; verify original official wording.", "No identity or guilt conclusion is made by this tool."] });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return res.status(aborted ? 504 : 502).json({ success: false, message: aborted ? "Official source request timed out." : "Unable to ingest the official source." });
  } finally {
    clearTimeout(timer);
  }
});

router.post("/admin/cases", requireFbiSecurityAdmin, async (req, res) => {
  const body = req.body ?? {};
  const sourceId = String(body.sourceId ?? "").trim().slice(0, 80);
  const sourceUrl = String(body.sourceUrl ?? "").trim();
  const agency = String(body.agency ?? "").trim().slice(0, 200);
  const title = String(body.title ?? "").trim().slice(0, 500);
  const summary = String(body.summary ?? "").trim().slice(0, 10000);
  const tipUrl = String(body.tipUrl ?? "").trim().slice(0, 1000);
  if (!sourceId || !agency || !title || !sourceUrl || summary.length === 0) {
    return res.status(400).json({ success: false, message: "sourceId, agency, title, sourceUrl and summary are required." });
  }
  let url: URL;
  try { url = new URL(sourceUrl); } catch { return res.status(400).json({ success: false, message: "Invalid source URL." }); }
  const allowedHosts = new Set(["www.fbi.gov", "tips.fbi.gov", "www.justice.gov", "www.sec.gov", "www.ftc.gov", "reportfraud.ftc.gov", "www.usmarshals.gov"]);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase()) || url.username || url.password || url.port) {
    return res.status(400).json({ success: false, message: "Only HTTPS URLs on registered official source hosts are accepted." });
  }
  for (const key of ["rewardAmountText", "rewardExactWording"]) {
    if (body[key] != null && String(body[key]).length > 1000) return res.status(400).json({ success: false, message: key + " is too long." });
  }
  const id = createHash("sha256").update(sourceId + "|" + sourceUrl.split("#")[0]).digest("hex").slice(0, 24);
  const contentHash = createHash("sha256").update(summary, "utf8").digest("hex");
  try {
    await ensureSchema();
    const result = await pool.query(
      `INSERT INTO redom_fbi_security_cases (id, source_id, agency, title, category, source_url,
       published_at, retrieved_at, content_sha256, summary, reward_advertised, reward_amount_text,
       reward_exact_wording, reward_conditions, tip_url, review_status)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,now(),$8,$9,$10,$11,$12,$13::jsonb,$14,'new')
       ON CONFLICT (id) DO UPDATE SET agency=EXCLUDED.agency,title=EXCLUDED.title,
       category=EXCLUDED.category,source_url=EXCLUDED.source_url,published_at=EXCLUDED.published_at,
       retrieved_at=now(),content_sha256=EXCLUDED.content_sha256,summary=EXCLUDED.summary,
       reward_advertised=EXCLUDED.reward_advertised,reward_amount_text=EXCLUDED.reward_amount_text,
       reward_exact_wording=EXCLUDED.reward_exact_wording,reward_conditions=EXCLUDED.reward_conditions,
       tip_url=EXCLUDED.tip_url RETURNING id,title,source_url,retrieved_at,review_status`,
      [id, sourceId, agency, title, JSON.stringify(Array.isArray(body.category) ? body.category.slice(0, 20) : []),
       sourceUrl.split("#")[0], body.publishedAt ? new Date(body.publishedAt) : null, contentHash, summary,
       Boolean(body.rewardAdvertised), body.rewardAmountText ? String(body.rewardAmountText) : null,
       body.rewardExactWording ? String(body.rewardExactWording) : null,
       JSON.stringify(Array.isArray(body.rewardConditions) ? body.rewardConditions.slice(0, 20).map((x: unknown) => String(x).slice(0, 200)) : []),
       tipUrl || null]
    );
    await audit("public_notice_imported", id, { sourceId, sourceUrl });
    return res.status(201).json({ success: true, case: result.rows[0] });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to store public notice." });
  }
});

router.patch("/admin/cases/:caseId/status", requireFbiSecurityAdmin, async (req, res) => {
  const id = String(req.params.caseId ?? "").slice(0, 80);
  const status = String(req.body?.status ?? "");
  const allowed = new Set(["new", "under_review", "verified_public_source", "submitted_by_human", "closed"]);
  if (!allowed.has(status)) return res.status(400).json({ success: false, message: "Unsupported review status." });
  try {
    await ensureSchema();
    const result = await pool.query("UPDATE redom_fbi_security_cases SET review_status=$2 WHERE id=$1 RETURNING id,review_status", [id, status]);
    if (!result.rows[0]) return res.status(404).json({ success: false, message: "Public notice not found." });
    await audit("case_review_status_changed", id, { status });
    return res.json({ success: true, case: result.rows[0] });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to update review status." });
  }
});

router.post("/admin/cases/:caseId/notes", requireFbiSecurityAdmin, async (req, res) => {
  const id = String(req.params.caseId ?? "").slice(0, 80);
  const note = String(req.body?.note ?? "").replace(/\s+/g, " ").trim();
  const label = String(req.body?.analystLabel ?? "analyst").slice(0, 80);
  if (!note || note.length > 3000) return res.status(400).json({ success: false, message: "Note must be 1-3000 characters." });
  if (/\b(?:SSN|social security number|TIN|taxpayer identification|bank account|routing number|password|access token)\b/i.test(note)) {
    return res.status(400).json({ success: false, message: "Notes must not contain restricted identity, financial, or credential data." });
  }
  try {
    await ensureSchema();
    const found = await pool.query("SELECT id FROM redom_fbi_security_cases WHERE id=$1", [id]);
    if (!found.rows[0]) return res.status(404).json({ success: false, message: "Public notice not found." });
    const result = await pool.query("INSERT INTO redom_fbi_security_analyst_notes(case_id,analyst_label,note) VALUES($1,$2,$3) RETURNING id,case_id,analyst_label,note,created_at", [id,label,note]);
    await audit("analyst_note_added", id, { noteId: result.rows[0].id });
    return res.status(201).json({ success: true, note: result.rows[0] });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to save analyst note." });
  }
});

router.get("/admin/cases/:caseId/notes", requireFbiSecurityAdmin, async (req, res) => {
  const id = String(req.params.caseId ?? "").slice(0, 80);
  try {
    await ensureSchema();
    const result = await pool.query("SELECT id,case_id,analyst_label,note,created_at FROM redom_fbi_security_analyst_notes WHERE case_id=$1 ORDER BY id DESC LIMIT 100", [id]);
    await audit("analyst_notes_viewed", id, { count: result.rowCount ?? result.rows.length });
    return res.json({ success: true, notes: result.rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve analyst notes." });
  }
});

router.get("/admin/audit", requireFbiSecurityAdmin, async (req, res) => {
  try {
    await ensureSchema();
    const result = await pool.query("SELECT id,event_type,record_id,metadata,created_at FROM redom_fbi_security_audit_events ORDER BY id DESC LIMIT $1", [boundedLimit(req.query.limit,100)]);
    return res.json({ success: true, events: result.rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve audit history." });
  }
});

export default router;
