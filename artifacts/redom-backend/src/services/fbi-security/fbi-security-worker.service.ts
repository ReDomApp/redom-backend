import { Resend } from "resend";
import { createHash } from "node:crypto";
import { pool } from "../../database/db";
import { logger } from "../../lib/logger";
import { env } from "../../config/env";

/**
 * FBI Security hourly public-source review report.
 *
 * Runs inside the existing backend process once per hour and uses PostgreSQL advisory locks
 * so multiple Render instances do not send duplicate hourly reports.
 * The digest contains aggregate public-notice metadata only; it never sends
 * full scraped text, private identifiers, financial data, or analyst notes.
 */
const WORKER_ENABLED = () => process.env.FBI_SECURITY_WORKER_ENABLED === "true";
const INTERVAL_MS = 60 * 60_000;
const LOCK_KEY = 741_820_611;
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;
let currentRunStartedAt = 0;
let researchedCasesThisRun = 0;

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


const RESEARCH_MAX_MS = 55 * 60_000;
const RESEARCH_MAX_CASES = 12;
const RESEARCH_MAX_ROUNDS = 3;
const RESEARCH_MAX_BYTES = 30_000;

async function boundedJsonFetch(url: string, init: RequestInit, timeoutMs = 90_000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: "error" });
    const text = await response.text();
    if (!response.ok) throw new Error("Research provider returned HTTP " + response.status);
    if (Buffer.byteLength(text, "utf8") > RESEARCH_MAX_BYTES) throw new Error("Research provider response exceeded size limit");
    return JSON.parse(text);
  } finally { clearTimeout(timeout); }
}

function extractOpenAiText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const parts: string[] = [];
  for (const item of payload?.output ?? []) for (const content of item?.content ?? []) if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
  return parts.join("\n").slice(0, 20_000);
}

async function researchWithOpenAI(prompt: string): Promise<{provider:string;text:string}> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const payload = await boundedJsonFetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.FBI_SECURITY_OPENAI_MODEL?.trim() || "gpt-5",
      tools: [{ type: "web_search", search_context_size: "high" }],
      tool_choice: "required",
      background: false,
      input: prompt,
    }),
  }, 180_000);
  const text = extractOpenAiText(payload);
  if (!text) throw new Error("OpenAI returned no research text");
  return { provider: "OpenAI web_search", text };
}

async function researchWithGemini(prompt: string): Promise<{provider:string;text:string}> {
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const model = process.env.FBI_SECURITY_GEMINI_MODEL?.trim() || "gemini-2.5-pro";
  const payload = await boundedJsonFetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 6000 },
    }),
  }, 180_000);
  const text = (payload?.candidates?.[0]?.content?.parts ?? []).map((p: any) => typeof p.text === "string" ? p.text : "").join("\n").slice(0, 20_000);
  if (!text) throw new Error("Gemini returned no research text");
  return { provider: "Gemini Google Search", text };
}

async function ensureResearchSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS redom_fbi_security_research_runs (
      id bigserial PRIMARY KEY,
      case_id text NOT NULL REFERENCES redom_fbi_security_cases(id) ON DELETE CASCADE,
      provider text NOT NULL,
      run_key text NOT NULL,
      status text NOT NULL CHECK (status IN ('completed','failed','skipped')),
      research_text text NOT NULL DEFAULT '',
      source_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(case_id, provider, run_key)
    );
    CREATE INDEX IF NOT EXISTS redom_fbi_security_research_case_idx ON redom_fbi_security_research_runs(case_id, created_at DESC);
  `);
}

function researchPrompt(title: string, officialUrl: string, officialText: string, round: number, prior: string): string {
  return [
    "Produce a useful, case-specific, source-cited public intelligence brief about the individual explicitly named in this official U.S. federal wanted/enforcement notice. Do not return a generic directory summary.",
    "Starting official notice: " + officialUrl,
    "Notice title: " + title,
    "Official notice excerpt: " + officialText.slice(0, 6500),
    "Research round: " + round + " of " + RESEARCH_MAX_ROUNDS + ".",
    "Previously discovered leads and findings: " + (prior || "No earlier research results; begin from the official notice."),
    "SCOPE: The FBI wanted-profile URL supplied above is the sole discovery anchor. Research exactly the one named person in that profile. Only after establishing that profile, search other public websites for records that explicitly correspond to this same person and same case; use the name plus the FBI-disclosed aliases, case number, charge, location/jurisdiction, and dates as cross-checks. Follow relevant links from the FBI notice and corroborating sources. Do not run broad searches for unrelated FBI notices, other people, or general agency programme pages. Prioritize official court/regulator records and reputable independent reporting; search aliases only when the FBI notice or reliable case sources connect them. Prioritize cases announced or materially updated in 2026, while including older records only when they directly explain this same case. Check the FBI profile's current status and latest dated update.",
    "REQUIRED OUTPUT, using these exact headings: SUBJECT AND CASE; WHAT WAS FOUND; PUBLIC CASE TIMELINE; CASE STATUS; REWARD VERIFICATION; SOURCE-BY-SOURCE COMPARISON; UNRESOLVED DISCREPANCIES; NEXT PUBLIC SOURCES TO CHECK.",
    "SUBJECT AND CASE: start with exactly one person named in the FBI profile. Record the exact FBI profile URL, subject name as published, FBI-disclosed aliases, case/reference numbers, alleged conduct as described by sources, and why each external record matches this same person and case. Do not combine same-name people. If matching details are insufficient, label the external result an unresolved same-name candidate and exclude it from confirmed findings. Do not produce a multi-person list.",
    "WHAT WAS FOUND: list only concrete facts relevant to this person's FBI case, with source title, publication/update date, direct URL, exact supported fact, and the match rationale. Distinguish official public-record facts, allegations, reporting, and inference. No general dossier: exclude relatives, private home addresses, personal phone/email, private social accounts, SSNs or other private identifiers, people-search/data-broker profiles, and unrelated personal details. If reliable sources directly connect the subject to a business relevant to the case, check official corporate registries, SEC EDGAR, regulator enforcement pages, court records, or relevant public professional-license records. Clearly distinguish confirmed links from same-name matches.",
    "REWARD VERIFICATION IS MANDATORY: extract the exact reward amount and conditions from the primary official notice, including currency, maximum vs fixed amount, eligibility, deadline, and qualifying information if stated. Then compare against at least two independent reliable sources where available (prefer official agency pages/releases and court or agency records; reputable news only as secondary corroboration). Give each source's exact amount/wording, date, URL, and whether it agrees, conflicts, or does not mention a reward. State a verdict: VERIFIED AGAINST MULTIPLE SOURCES, OFFICIAL SOURCE ONLY—NOT INDEPENDENTLY CORROBORATED, CONFLICTING AMOUNTS—HUMAN REVIEW REQUIRED, or NO REWARD STATED IN THE OFFICIAL NOTICE. Never invent an amount. If fewer than two reliable sources exist, say exactly which sources were checked and what additional evidence is needed; do not write 'unknown' or imply verification.",
    "If a page is unavailable or no reliable corroboration is found, report the concrete limitation and what was checked; never substitute 'unknown', 'N/A', or a generic answer for the research. A missing result is not proof that information does not exist.",
    "Search only information legitimately published for public access and relevant to this exact public case. You may list official company websites, public corporate filings, public business contact channels, and clearly official business/social-media accounts that the company itself publishes. For the named subject, include only social profiles that the official case notice or reliable case reporting explicitly identifies as relevant to the case; do not infer ownership from a similar name or photo. Do NOT query or seek Social Security Administration/SSN records, IRS/tax records, restricted licensing systems, private databases, relatives/family trees, genealogy/family-tree search sites, home addresses, personal phone numbers, personal emails, precise/private locations, private social accounts, people-search or data-broker profiles including Whitepages, TruePeopleSearch, Extended, or similar services, private identifiers, or unrelated personal details. Do not use people-search listings or an address appearing in a broker database to confirm that a named person is the FBI-notice subject or that the person resides at that address. Do not build a family tree or aggregate relatives. Establish case identity only through the official notice and independent reliable public reporting or court/regulator records that directly tie the person to the same case; explain conflicts and same-name ambiguity. Do not identify or accuse a person from a name/photo resemblance alone. For public business records, use official state corporate registries and licensing lookup pages; describe a registry as unavailable when it is not public or accessible rather than attempting to bypass access controls.",
    "Finish with a concise source list and confidence assessment grounded in the actual evidence. Explicitly state when a claim is not corroborated. Do not recommend contacting, confronting, tracking, or surveilling anyone; do not submit tips automatically."
  ].join("\n\n");
}

async function runCaseResearch(caseId: string, title: string, officialUrl: string, officialText: string, runKey: string): Promise<number> {
  await ensureResearchSchema();
  const enabled = Boolean(process.env.OPENAI_API_KEY?.trim()) || Boolean((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GEMINI_API_KEY)?.trim());
  if (!enabled) {
    logger.warn({ caseId }, "FBI Security AI-assisted research skipped: configure OPENAI_API_KEY and/or GEMINI_API_KEY");
    return 0;
  }
  const started = Date.now();
  let completed = 0;
  let prior = "";
  const maxRounds = Math.max(1, Math.min(RESEARCH_MAX_ROUNDS, Number(process.env.FBI_SECURITY_RESEARCH_ROUNDS ?? RESEARCH_MAX_ROUNDS) || RESEARCH_MAX_ROUNDS));
  for (let round = 1; round <= maxRounds && Date.now() - started < RESEARCH_MAX_MS; round++) {
    const prompt = researchPrompt(title, officialUrl, officialText, round, prior);
    const providers = [
      ...(process.env.OPENAI_API_KEY?.trim() ? [() => researchWithOpenAI(prompt)] : []),
      ...((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GEMINI_API_KEY)?.trim() ? [() => researchWithGemini(prompt)] : []),
    ];
    const results = await Promise.allSettled(providers.map((run) => run()));
    const texts: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const providerName = i === 0 && process.env.OPENAI_API_KEY?.trim() ? "OpenAI web_search" : "Gemini Google Search";
      const result = results[i];
      if (result.status === "fulfilled") {
        const item = result.value;
        texts.push(item.text);
        const urls = [...new Set(item.text.match(/https:\/\/[^\s"'<>]+/g) ?? [])].map((u) => u.replace(/[.,;]+$/, "")).filter((u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } }).slice(0, 100);
        await pool.query(
          `INSERT INTO redom_fbi_security_research_runs(case_id,provider,run_key,status,research_text,source_urls)
           VALUES($1,$2,$3,'completed',$4,$5::jsonb)
           ON CONFLICT(case_id,provider,run_key) DO UPDATE SET status='completed',research_text=EXCLUDED.research_text,source_urls=EXCLUDED.source_urls,error_message=NULL,created_at=now()`,
          [caseId, item.provider, runKey + ":round-" + round, item.text.slice(0, 20_000), JSON.stringify(urls)],
        );
        completed++;
      } else {
        await pool.query(
          `INSERT INTO redom_fbi_security_research_runs(case_id,provider,run_key,status,error_message)
           VALUES($1,$2,$3,'failed',$4)
           ON CONFLICT(case_id,provider,run_key) DO UPDATE SET status='failed',error_message=EXCLUDED.error_message,created_at=now()`,
          [caseId, providerName, runKey + ":round-" + round, (result.reason instanceof Error ? result.reason.message : String(result.reason)).slice(0, 500)],
        );
      }
    }
    prior = texts.join("\n\n--- Independent provider results ---\n\n").slice(0, 12_000);
    // Continue only while at least one provider yields a concrete source-backed lead.
    const hasLead = /https:\/\//i.test(prior) && /corroborat|court|indict|charged|convict|official|press release|reward|filing|case number|reported/i.test(prior);
    if (!hasLead) break;
  }
  await pool.query(
    `INSERT INTO redom_fbi_security_audit_events(event_type,record_id,metadata,created_at)
     VALUES('ai_public_web_research_completed',$1,$2::jsonb,now())`,
    [caseId, JSON.stringify({ providers: [...(process.env.OPENAI_API_KEY?.trim() ? ["OpenAI"] : []), ...((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GEMINI_API_KEY)?.trim() ? ["Gemini"] : [])], rounds: maxRounds, completedProviderRuns: completed, elapsedMs: Date.now() - started })],
  );
  return completed;
}

async function pollConfiguredOfficialUrls(): Promise<number> {
  // Discovery is intentionally FBI-only. Other public sites are searched only
  // after a single-person FBI wanted notice has been accepted as the case anchor.
  const configured = ["https://www.fbi.gov/wanted"];
  const queued = new Set(configured);
  let imported = 0;
  for (const rawUrl of configured) {
    if (Date.now() - currentRunStartedAt >= RESEARCH_MAX_MS || researchedCasesThisRun >= RESEARCH_MAX_CASES) break;
    let url: URL;
    try { url = new URL(rawUrl); } catch { continue; }
    const source = url.hostname.toLowerCase() === "www.fbi.gov"
      ? { id: "fbi_wanted", agency: "Federal Bureau of Investigation", tipUrl: "https://tips.fbi.gov/" }
      : undefined;
    if (url.protocol !== "https:" || !source || url.username || url.password || url.port || url.pathname.split("/").filter(Boolean)[0] !== "wanted") continue;
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
      // Discover a bounded set of individual public notices from this official page.
      if (configured.length < 60) {
        const anchors = raw.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi);
        for (const match of anchors) {
          if (configured.length >= 60) break;
          try {
            const link = new URL(match[1], url);
            const host = link.hostname.toLowerCase();
            const path = link.pathname.toLowerCase();
            // Follow only individual FBI wanted-profile URLs during discovery.
            const individual = host === "www.fbi.gov"
              && /^\/wanted\/(?:[^/]+\/){1,3}[^/]+\/?$/.test(path)
              && !/\/(?:index|search|most-wanted|ten-most-wanted|wanted-fugitives)\/?$/.test(path);
            // The first phase must never crawl other agencies or general pages.
            if (link.protocol === "https:" && host === "www.fbi.gov" && !link.username && !link.password && !link.port && individual && !queued.has(link.toString())) {
              queued.add(link.toString());
              configured.push(link.toString());
            }
          } catch { /* Ignore malformed links. */ }
        }
      }
      if (Buffer.byteLength(raw, "utf8") > 2_000_000) continue;
      const clean = raw.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg|iframe|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
      const text = clean.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim().slice(0, 10_000);
      if (text.length < 40) continue;
      const individualNotice = url.hostname.toLowerCase() === "www.fbi.gov"
        && /^\/wanted\/(?:[^/]+\/){1,3}[^/]+\/?$/i.test(url.pathname)
        && !/\/(?:index|search|most-wanted|ten-most-wanted|wanted-fugitives)\/?$/i.test(url.pathname);
      if (!individualNotice) continue;
      const titleMatch = clean.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
      const title = (titleMatch?.[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s*[|—-]\s*(?:the )?FBI.*$/i, "").replace(/\s+/g, " ").trim().slice(0, 300);
      // A result must be anchored to one named person, not an index, gang,
      // organization, or multi-subject roundup.
      const genericTitle = /^(?:wanted|most wanted|ten most wanted fugitives|wanted fugitives|seeking information|fbi wanted list)$/i.test(title);
      const groupTitle = /\b(gang|organization|organisation|network|group|cartel|crew|fugitives|individuals|members|persons of interest)\b/i.test(title);
      const titleWords = title.split(/\s+/).filter((word) => /^[\p{L}][\p{L}'’-]*$/u.test(word));
      if (genericTitle || groupTitle || titleWords.length < 2 || titleWords.length > 7) continue;
      const rewardText = text.match(/.{0,160}(?:reward|up to\s*\$\s?[0-9][0-9,]*).{0,240}/i)?.[0]?.trim().slice(0, 600) ?? null;
      const amount = rewardText?.match(/(?:up to\s*)?\$\s?[0-9][0-9,]*(?:\.\d{2})?/i)?.[0]?.trim() ?? null;
      const reward = Boolean(rewardText && amount && /reward|offering|offers/i.test(rewardText));
      const canonical = url.toString().split("#")[0];
      const id = createHash("sha256").update(source.id + "|" + canonical).digest("hex").slice(0, 24);
      const hash = createHash("sha256").update(text, "utf8").digest("hex");
      const previous = await pool.query("SELECT content_sha256,review_status FROM redom_fbi_security_cases WHERE id=$1", [id]);
      const isNewOrChanged = (!previous.rows[0] || previous.rows[0].content_sha256 !== hash) && (!previous.rows[0] || previous.rows[0].review_status !== "closed");
      const relevantRiskNotice = /fraud|scam|wire fraud|money laundering|financial crime|payment fraud|bribery|embezzlement|securities fraud|consumer restitution|reward|valuable information|tip line|enforcement action/i.test(text);
      const result = await pool.query(
        `INSERT INTO redom_fbi_security_cases(id,source_id,agency,title,category,source_url,retrieved_at,content_sha256,summary,reward_advertised,reward_amount_text,reward_exact_wording,reward_conditions,tip_url,review_status)
         VALUES($1,$2,$3,$4,'[]'::jsonb,$5,now(),$6,$7,$8,$9,$10,'[]'::jsonb,$11,'new')
         ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,retrieved_at=now(),content_sha256=EXCLUDED.content_sha256,summary=EXCLUDED.summary,reward_advertised=EXCLUDED.reward_advertised,reward_amount_text=EXCLUDED.reward_amount_text,reward_exact_wording=EXCLUDED.reward_exact_wording,tip_url=EXCLUDED.tip_url
         RETURNING (xmax = 0) AS inserted`,
        [id, source.id, source.agency, title || "Official public notice", canonical, hash, text, reward, amount, rewardText, source.tipUrl],
      );
      const caseNumber = "FBI-" + new Date().getUTCFullYear() + "-" + createHash("sha256").update(id).digest("hex").slice(0, 12).toUpperCase();
      await pool.query("UPDATE redom_fbi_security_cases SET case_number=$1 WHERE id=$2 AND case_number IS NULL", [caseNumber, id]);
      if (isNewOrChanged && relevantRiskNotice) imported++;
      if (individualNotice && relevantRiskNotice && researchedCasesThisRun < RESEARCH_MAX_CASES && Date.now() - currentRunStartedAt < RESEARCH_MAX_MS) {
        researchedCasesThisRun++;
        try {
          await runCaseResearch(id, title, canonical, text, new Date().toISOString().slice(0, 13));
        } catch (researchError) {
          logger.warn({ caseId: id, error: researchError instanceof Error ? researchError.message : String(researchError) }, "FBI Security AI-assisted public-web research failed");
        }
      }
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
  currentRunStartedAt = Date.now();
  researchedCasesThisRun = 0;
  const client = await pool.connect();
  let locked = false;
  let runId: number | undefined;
  try {
    await ensureDigestSchema();
    await ensureResearchSchema();
    const lock = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_KEY]);
    locked = lock.rows[0]?.locked === true;
    if (!locked) return;

    const hour = new Date().toISOString().slice(0, 13);
    const runKey = `hourly-public-intelligence:${hour}`;
    const importedCount = await pollConfiguredOfficialUrls();
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
             count(*) FILTER (WHERE retrieved_at >= now() - interval '1 hour')::int AS last_hour
      FROM redom_fbi_security_cases
    `);
    const recent = await client.query(`
      SELECT c.id,c.agency,c.title,c.source_url,c.retrieved_at,c.reward_advertised,c.reward_amount_text,c.review_status,
             (SELECT string_agg(r.provider || ': ' || left(r.research_text, 3500), E'\\n\\n' ORDER BY r.created_at DESC)
              FROM redom_fbi_security_research_runs r
              WHERE r.case_id=c.id AND r.status='completed' AND r.created_at >= now() - interval '1 hour') AS research_summary
      FROM redom_fbi_security_cases c
      WHERE c.retrieved_at >= now() - interval '1 hour'
      ORDER BY c.retrieved_at DESC LIMIT 50
    `);
    const c = counts.rows[0] ?? { total: 0, reward_count: 0, new_count: 0, last_hour: 0 };
    const base = publicBaseUrl();
    const reportUrl = base + "/cases";
    const items = recent.rows.map((item: any) => {
      const reward = item.reward_advertised
        ? `<p><strong>Reward lead — NOT YET VERIFIED:</strong> ${escapeHtml(item.reward_amount_text ?? "The page contains reward-related wording but no safely extracted amount.")}. The research section must compare the official wording against independent reliable sources; do not treat the extracted amount as confirmed.</p>`
        : `<p><strong>Reward check:</strong> No reward amount was extracted from this page. This does not prove no reward exists; see the source-by-source research check.</p>`;
      const research = item.research_summary ? `<p><strong>AI-assisted public-source research (review required):</strong><br>${escapeHtml(item.research_summary).replace(/\\n/g, "<br>")}</p>` : "<p><strong>AI-assisted research:</strong> No completed research results are stored for this notice yet. This is a failed/incomplete research state, not a finding that no related information exists.</p>";
      return `<li style="margin:0 0 22px"><strong>${escapeHtml(item.title)}</strong><br><span>${escapeHtml(item.agency)} · status: ${escapeHtml(item.review_status)}</span>${reward}${research}<br><a href="${escapeHtml(item.source_url)}">Open official source</a> · <a href="${escapeHtml(base + "/cases/" + encodeURIComponent(item.id) + "/report")}">Open draft report</a></li>`;
    }).join("");
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#172033">
      <h1>FBI Security — Public-Source Review Digest</h1>
      <p>Automated internal digest from the separate FBI Security module in the existing backend. This is not an official FBI communication and does not establish wrongdoing.</p>
      <ul><li>Public notices tracked: <strong>${Number(c.total)}</strong></li><li>Reward notices flagged for manual verification: <strong>${Number(c.reward_count)}</strong></li><li>Notices awaiting initial review: <strong>${Number(c.new_count)}</strong></li><li>Retrieved in the last hour: <strong>${Number(c.last_hour)}</strong></li></ul>
      <h2>Recently retrieved notices</h2>${items || "<p>No public notices were retrieved in the last hour.</p>"}
      <p><a href="${escapeHtml(reportUrl)}">Open public-source case list</a></p>
      <hr><p style="font-size:12px;color:#596579">Public-source data only. Reward detection is heuristic and must be checked against the original notice. Human review is required before any official submission. Do not add restricted identity, tax, financial, credential, or private-account information.</p>
      </body></html>`;
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.FBI_SECURITY_EMAIL_FROM?.trim() || process.env.REDOM_OPS_REPORT_FROM?.trim() || env.email.reportsFrom;
    if (!apiKey || !from) {
      await client.query("UPDATE redom_fbi_security_worker_runs SET status='skipped',finished_at=now(),details=$2::jsonb WHERE id=$1", [runId, JSON.stringify({ reason: "Missing RESEND_API_KEY or FBI_SECURITY_EMAIL_FROM; no email sent." })]);
      return;
    }
    const resend = new Resend(apiKey);
    const sent = await resend.emails.send({
      from,
      to,
      subject: `FBI Security hourly public-source report — ${hour}:00 UTC`,
      html,
      headers: { "X-Entity-Ref-ID": `fbi-security-${hour}` },
    });
    if (sent.error) throw new Error(sent.error.message || "Resend rejected the digest");
    await client.query(
      "UPDATE redom_fbi_security_worker_runs SET status='sent',finished_at=now(),cases_count=$2,details=$3::jsonb WHERE id=$1",
      [runId, recent.rows.length, JSON.stringify({ recipients: to.length, providerMessageId: sent.data?.id ?? null, hour, importedCount, researchedCases: researchedCasesThisRun, elapsedMs: Date.now() - currentRunStartedAt, timeBudgetMs: RESEARCH_MAX_MS })],
    );
    await client.query(
      `INSERT INTO redom_fbi_security_audit_events(event_type,record_id,metadata,created_at)
       VALUES('scheduled_digest_sent',NULL,$1::jsonb,now())`,
      [JSON.stringify({ runKey, recipientCount: to.length, recentNoticeCount: recent.rows.length })],
    );
    logger.info({ runKey, recentNoticeCount: recent.rows.length, recipientCount: to.length, importedCount }, "FBI Security hourly report sent");
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
  logger.info("FBI Security hourly lookup and report worker enabled");
}

export function stopFbiSecurityWorker(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
