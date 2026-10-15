import { Resend } from "resend";
import { createHash } from "node:crypto";
import { pool } from "../../database/db";
import { logger } from "../../lib/logger";
import { env } from "../../config/env";

/**
 * FBI Security scheduled review digest.
 *
 * Runs inside the existing backend process and uses PostgreSQL advisory locks
 * so multiple Render instances do not send the same digest concurrently.
 * The digest contains aggregate public-notice metadata only; it never sends
 * full scraped text, private identifiers, financial data, or analyst notes.
 */
const WORKER_ENABLED = () => process.env.FBI_SECURITY_WORKER_ENABLED === "true";
const INTERVAL_MS = 60 * 60_000;
const LOCK_KEY = 741_820_611;
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;

function recipients(): string[] {
  const configured = process.env.FBI_SECURITY_ADMIN_EMAILS ?? process.env.BUG_REPORT_RECIPIENTS ?? env.email.bugReportRecipients.join(",");
  return [...new Set(configured.split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)))];
}

function publicBaseUrl(): string {
  const configured = (process.env.FBI_SECURITY_PUBLIC_API_BASE_URL ?? "https://redom-backend.onrender.com/redom-backend/fbi-security").trim();
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe");
    return url.toString().replace(/\/$/, "");
  } catch {
    return "https://redom-backend.onrender.com/redom-backend/fbi-security";
  }
}

async function ensureDigestSchema(): Promise<void> {
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
    CREATE TABLE IF NOT EXISTS redom_fbi_security_audit_events (
      id bigserial PRIMARY KEY,
      event_type text NOT NULL,
      record_id text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS redom_fbi_security_worker_runs (
      id bigserial PRIMARY KEY,
      run_key text NOT NULL UNIQUE,
      status text NOT NULL CHECK (status IN ('running','sent','skipped','failed')),
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      cases_count integer NOT NULL DEFAULT 0,
      details jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    ALTER TABLE redom_fbi_security_cases ADD COLUMN IF NOT EXISTS case_number text;
    UPDATE redom_fbi_security_cases SET case_number = 'FBI-' || to_char(COALESCE(published_at, retrieved_at, now()), 'YYYY') || '-' || upper(substr(md5(id), 1, 12)) WHERE case_number IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS redom_fbi_security_cases_case_number_idx ON redom_fbi_security_cases(case_number) WHERE case_number IS NOT NULL;
    CREATE INDEX IF NOT EXISTS redom_fbi_security_worker_runs_started_idx ON redom_fbi_security_worker_runs (started_at DESC);
  `);
}

const OFFICIAL_HOSTS: Record<string, { id: string; agency: string; tipUrl: string }> = {
  "www.fbi.gov": { id: "fbi_wanted", agency: "Federal Bureau of Investigation", tipUrl: "https://tips.fbi.gov/" },
  "tips.fbi.gov": { id: "fbi_tips", agency: "Federal Bureau of Investigation", tipUrl: "https://tips.fbi.gov/" },
  "www.justice.gov": { id: "doj_news", agency: "U.S. Department of Justice", tipUrl: "https://www.justice.gov/" },
  "www.sec.gov": { id: "sec_litigation", agency: "U.S. Securities and Exchange Commission", tipUrl: "https://www.sec.gov/tcr" },
  "www.ftc.gov": { id: "ftc_news", agency: "Federal Trade Commission", tipUrl: "https://reportfraud.ftc.gov/" },
  "reportfraud.ftc.gov": { id: "ftc_report", agency: "Federal Trade Commission", tipUrl: "https://reportfraud.ftc.gov/" },
  "www.usmarshals.gov": { id: "us_marshals_fugitives", agency: "U.S. Marshals Service", tipUrl: "https://www.usmarshals.gov/what-we-do/fugitive-investigations" },
  "www.consumerfinance.gov": { id: "cfpb_enforcement", agency: "Consumer Financial Protection Bureau", tipUrl: "https://www.consumerfinance.gov/complaint/" },
  "www.cftc.gov": { id: "cftc_enforcement", agency: "Commodity Futures Trading Commission", tipUrl: "https://www.cftc.gov/complaint" },
  "www.fdic.gov": { id: "fdic_consumer", agency: "Federal Deposit Insurance Corporation", tipUrl: "https://ask.fdic.gov/fdicinformationandsupportcenter/s/" },
};

async function pollConfiguredOfficialUrls(): Promise<number> {
  const defaults = ["https://www.fbi.gov/wanted", "https://www.justice.gov/news", "https://www.sec.gov/litigation/litreleases", "https://www.ftc.gov/news-events/news/press-releases", "https://www.usmarshals.gov/what-we-do/fugitive-investigations", "https://www.consumerfinance.gov/enforcement/", "https://www.cftc.gov/PressRoom/PressReleases", "https://www.fdic.gov/consumer-resource-center"];
  const configured = [...new Set((process.env.FBI_SECURITY_MONITOR_URLS ?? defaults.join(",")).split(",").map((v) => v.trim()).filter(Boolean))].slice(0, 20);
  let imported = 0;
  for (const rawUrl of configured) {
    let url: URL;
    try { url = new URL(rawUrl); } catch { continue; }
    const source = OFFICIAL_HOSTS[url.hostname.toLowerCase()];
    if (url.protocol !== "https:" || !source || url.username || url.password || url.port) continue;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(url.toString(), {
        redirect: "manual", signal: controller.signal,
        headers: { "user-agent": "ReDom-FBI-Security-Public-Notice-Monitor/1.0", accept: "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml,text/plain" },
      });
      if (!response.ok || (response.status >= 300 && response.status < 400)) continue;
      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      if (!/(text\/html|application\/xhtml\+xml|application\/(?:rss\+xml|atom\+xml|xml)|text\/plain)/.test(contentType)) continue;
      const announced = Number(response.headers.get("content-length") ?? 0);
      if (announced > 2_000_000) continue;
      const raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > 2_000_000) continue;
      const clean = raw.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg|iframe|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
      const text = clean.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim().slice(0, 10_000);
      if (text.length < 40) continue;
      const titleMatch = clean.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
      const title = (titleMatch?.[1] ?? url.hostname + " official public notice").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
      const rewardText = text.match(/.{0,160}(?:reward|up to\s*\$\s?[0-9][0-9,]*).{0,240}/i)?.[0]?.trim().slice(0, 600) ?? null;
      const amount = rewardText?.match(/(?:up to\s*)?\$\s?[0-9][0-9,]*(?:\.\d{2})?/i)?.[0]?.trim() ?? null;
      const reward = Boolean(rewardText && amount && /reward|offering|offers/i.test(rewardText));
      const canonical = url.toString().split("#")[0];
      const id = createHash("sha256").update(source.id + "|" + canonical).digest("hex").slice(0, 24);
      const hash = createHash("sha256").update(text, "utf8").digest("hex");
      const previous = await pool.query("SELECT content_sha256 FROM redom_fbi_security_cases WHERE id=$1", [id]);
      const isNewOrChanged = !previous.rows[0] || previous.rows[0].content_sha256 !== hash;
      const result = await pool.query(
        `INSERT INTO redom_fbi_security_cases(id,source_id,agency,title,category,source_url,retrieved_at,content_sha256,summary,reward_advertised,reward_amount_text,reward_exact_wording,reward_conditions,tip_url,review_status)
         VALUES($1,$2,$3,$4,'[]'::jsonb,$5,now(),$6,$7,$8,$9,$10,'[]'::jsonb,$11,'new')
         ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,retrieved_at=now(),content_sha256=EXCLUDED.content_sha256,summary=EXCLUDED.summary,reward_advertised=EXCLUDED.reward_advertised,reward_amount_text=EXCLUDED.reward_amount_text,reward_exact_wording=EXCLUDED.reward_exact_wording,tip_url=EXCLUDED.tip_url
         RETURNING (xmax = 0) AS inserted`,
        [id, source.id, source.agency, title || "Official public notice", canonical, hash, text, reward, amount, rewardText, source.tipUrl],
      );
      const caseNumber = "FBI-" + new Date().getUTCFullYear() + "-" + createHash("sha256").update(id).digest("hex").slice(0, 12).toUpperCase();
      await pool.query("UPDATE redom_fbi_security_cases SET case_number=$1 WHERE id=$2 AND case_number IS NULL", [caseNumber, id]);
      if (isNewOrChanged) imported++;
      await pool.query(
        `INSERT INTO redom_fbi_security_audit_events(event_type,record_id,metadata,created_at) VALUES('scheduled_official_url_polled',$1,$2::jsonb,now())`,
        [id, JSON.stringify({ sourceId: source.id, sourceUrl: canonical, contentSha256: hash, changed: isNewOrChanged ? "new_or_changed" : "unchanged" })],
      );
    } catch (error) {
      logger.warn({ host: url.hostname, error: error instanceof Error ? error.message : String(error) }, "FBI Security public URL poll failed");
    } finally {
      clearTimeout(timeout);
    }
  }
  return imported;
}

async function sendImmediateNoticeAlert(to: string[], importedCount: number, day: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.FBI_SECURITY_EMAIL_FROM?.trim() || process.env.REDOM_OPS_REPORT_FROM?.trim() || "admin@wnncompany.com";
  if (!apiKey || !from || importedCount < 1) return;
  const base = publicBaseUrl();
  const html = "<h1>FBI Security notice update</h1><p>" + importedCount + " new official public notice record(s) were detected during hourly polling.</p><p><a href=\"" + base + "/cases\">Review case records</a></p><p>Official public-source information only. Verify source facts before action. No identity or guilt conclusion is implied.</p>";
  const sent = await new Resend(apiKey).emails.send({ from, to, subject: "FBI Security — new public notices detected (" + day + ")", html });
  if (sent.error) throw new Error(sent.error.message || "Unable to send new-notice alert");
}
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c] as string);
}

async function runDigest(): Promise<void> {
  if (!WORKER_ENABLED() || running) return;
  const to = recipients();
  if (!to.length) return;
  running = true;
  const client = await pool.connect();
  let locked = false;
  let runId: number | undefined;
  try {
    await ensureDigestSchema();
    const lock = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_KEY]);
    locked = lock.rows[0]?.locked === true;
    if (!locked) return;

    const day = new Date().toISOString().slice(0, 10);
    const runKey = `daily-public-intelligence:${day}`;
    const importedCount = await pollConfiguredOfficialUrls();
    const existing = await client.query("SELECT id,status FROM redom_fbi_security_worker_runs WHERE run_key=$1", [runKey]);
    if (existing.rows[0]?.status === "sent" || existing.rows[0]?.status === "skipped") { if (importedCount > 0) await sendImmediateNoticeAlert(to, importedCount, day); return; }
    const inserted = await client.query(
      `INSERT INTO redom_fbi_security_worker_runs(run_key,status)
       VALUES($1,'running') ON CONFLICT(run_key) DO UPDATE SET status='running',started_at=now()
       WHERE redom_fbi_security_worker_runs.status IN ('failed','running')
       RETURNING id`,
      [runKey],
    );
    if (!inserted.rows[0]) return;
    runId = Number(inserted.rows[0].id);

    const counts = await client.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE reward_advertised)::int AS reward_count,
             count(*) FILTER (WHERE review_status='new')::int AS new_count,
             count(*) FILTER (WHERE retrieved_at >= now() - interval '24 hours')::int AS last_24h
      FROM redom_fbi_security_cases
    `);
    const recent = await client.query(`
      SELECT id,agency,title,source_url,retrieved_at,reward_advertised,reward_amount_text,review_status
      FROM redom_fbi_security_cases
      WHERE retrieved_at >= now() - interval '24 hours'
      ORDER BY retrieved_at DESC LIMIT 25
    `);
    const c = counts.rows[0] ?? { total: 0, reward_count: 0, new_count: 0, last_24h: 0 };
    const base = publicBaseUrl();
    const reportUrl = base + "/cases";
    const items = recent.rows.map((item: any) => {
      const reward = item.reward_advertised
        ? `<p><strong>Reward wording detected:</strong> ${escapeHtml(item.reward_amount_text ?? "amount not confirmed")} — verify directly at the official source.</p>`
        : "";
      return `<li style="margin:0 0 18px"><strong>${escapeHtml(item.title)}</strong><br><span>${escapeHtml(item.agency)} · status: ${escapeHtml(item.review_status)}</span>${reward}<br><a href="${escapeHtml(item.source_url)}">Open official source</a> · <a href="${escapeHtml(base + "/cases/" + encodeURIComponent(item.id) + "/report")}">Open draft report</a></li>`;
    }).join("");
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#172033">
      <h1>FBI Security — Public-Source Review Digest</h1>
      <p>Automated internal digest from the separate FBI Security module in the existing backend. This is not an official FBI communication and does not establish wrongdoing.</p>
      <ul><li>Public notices tracked: <strong>${Number(c.total)}</strong></li><li>Reward notices flagged for manual verification: <strong>${Number(c.reward_count)}</strong></li><li>Notices awaiting initial review: <strong>${Number(c.new_count)}</strong></li><li>Retrieved in the last 24 hours: <strong>${Number(c.last_24h)}</strong></li></ul>
      <h2>Recently retrieved notices</h2>${items || "<p>No new public notices were retrieved in the last 24 hours.</p>"}
      <p><a href="${escapeHtml(reportUrl)}">Open public-source case list</a></p>
      <hr><p style="font-size:12px;color:#596579">Public-source data only. Reward detection is heuristic and must be checked against the original notice. Human review is required before any official submission. Do not add restricted identity, tax, financial, credential, or private-account information.</p>
      </body></html>`;
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.FBI_SECURITY_EMAIL_FROM?.trim();
    if (!apiKey || !from) {
      await client.query("UPDATE redom_fbi_security_worker_runs SET status='skipped',finished_at=now(),details=$2::jsonb WHERE id=$1", [runId, JSON.stringify({ reason: "Missing RESEND_API_KEY or FBI_SECURITY_EMAIL_FROM; no email sent." })]);
      return;
    }
    const resend = new Resend(apiKey);
    const sent = await resend.emails.send({
      from,
      to,
      subject: `FBI Security public-source digest — ${day}`,
      html,
      headers: { "X-Entity-Ref-ID": `fbi-security-${day}` },
    });
    if (sent.error) throw new Error(sent.error.message || "Resend rejected the digest");
    await client.query(
      "UPDATE redom_fbi_security_worker_runs SET status='sent',finished_at=now(),cases_count=$2,details=$3::jsonb WHERE id=$1",
      [runId, recent.rows.length, JSON.stringify({ recipients: to.length, providerMessageId: sent.data?.id ?? null, date: day, importedCount })],
    );
    await client.query(
      `INSERT INTO redom_fbi_security_audit_events(event_type,record_id,metadata,created_at)
       VALUES('scheduled_digest_sent',NULL,$1::jsonb,now())`,
      [JSON.stringify({ runKey, recipientCount: to.length, recentNoticeCount: recent.rows.length })],
    );
    logger.info({ runKey, recentNoticeCount: recent.rows.length, recipientCount: to.length, importedCount }, "FBI Security daily digest sent");
  } catch (error) {
    if (runId) {
      try {
        await client.query("UPDATE redom_fbi_security_worker_runs SET status='failed',finished_at=now(),details=$2::jsonb WHERE id=$1", [
          runId, JSON.stringify({ error: error instanceof Error ? error.message.slice(0, 300) : "Unknown failure" }),
        ]);
      } catch { /* Preserve original failure. */ }
    }
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "FBI Security digest worker failed");
  } finally {
    if (locked) {
      try { await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]); } catch { /* Connection release unlocks session locks. */ }
    }
    client.release();
    running = false;
  }
}

export function startFbiSecurityWorker(): void {
  if (timer || !WORKER_ENABLED()) return;
  timer = setInterval(() => { void runDigest(); }, INTERVAL_MS);
  timer.unref?.();
  void runDigest();
  logger.info("FBI Security digest worker enabled");
}

export function stopFbiSecurityWorker(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
