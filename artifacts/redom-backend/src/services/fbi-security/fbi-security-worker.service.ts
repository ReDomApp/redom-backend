import { Resend } from "resend";
import { pool } from "../../database/db";
import { logger } from "../../lib/logger";

/**
 * FBI Security scheduled review digest.
 *
 * Runs inside the existing backend process and uses PostgreSQL advisory locks
 * so multiple Render instances do not send the same digest concurrently.
 * The digest contains aggregate public-notice metadata only; it never sends
 * full scraped text, private identifiers, financial data, or analyst notes.
 */
const WORKER_ENABLED = () => process.env.FBI_SECURITY_WORKER_ENABLED === "true";
const INTERVAL_MS = 60_000;
const LOCK_KEY = 741_820_611;
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;

function recipients(): string[] {
  return [...new Set((process.env.FBI_SECURITY_ADMIN_EMAILS ?? "")
    .split(",").map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)))];
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
    CREATE INDEX IF NOT EXISTS redom_fbi_security_worker_runs_started_idx
      ON redom_fbi_security_worker_runs (started_at DESC);
  `);
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
    const existing = await client.query("SELECT id,status FROM redom_fbi_security_worker_runs WHERE run_key=$1", [runKey]);
    if (existing.rows[0]?.status === "sent" || existing.rows[0]?.status === "skipped") return;

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
      [runId, recent.rows.length, JSON.stringify({ recipients: to.length, providerMessageId: sent.data?.id ?? null, date: day })],
    );
    await client.query(
      `INSERT INTO redom_fbi_security_audit_events(event_type,record_id,metadata,created_at)
       VALUES('scheduled_digest_sent',NULL,$1::jsonb,now())`,
      [JSON.stringify({ runKey, recipientCount: to.length, recentNoticeCount: recent.rows.length })],
    );
    logger.info({ runKey, recentNoticeCount: recent.rows.length, recipientCount: to.length }, "FBI Security daily digest sent");
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
