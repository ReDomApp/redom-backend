import { Resend } from "resend";
import { createHash } from "node:crypto";
import { pool } from "../../database/db";
import { logger } from "../../lib/logger";
import { env } from "../../config/env";
import { parseFbiWantedProfileHtml, FBI_FRAUDSTERS_INDEX } from "./fbi-wanted-profile";
import { buildCaseResearchPlan, buildResearchInstructions } from "./case-research-planner";

/**
 * FBI Security hourly public-source review report.
 *
 * Runs inside the existing backend process once per hour and uses PostgreSQL advisory locks
 * so multiple Render instances do not send duplicate hourly reports.
 * The digest contains aggregate public-notice metadata only; it never sends
 * full scraped text, private identifiers, financial data, or analyst notes.
 */
// Permanently disabled by explicit operator request. Keep the implementation in-repo for reference, but never run it.\nconst WORKER_ENABLED = () => false;
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
const PROVIDER_COOLDOWN_MS = 30 * 60_000;
const providerCooldownUntil = new Map<string, number>();
function providerCoolingDown(name: string): boolean { return (providerCooldownUntil.get(name) ?? 0) > Date.now(); }
function cooldownProvider(name: string, durationMs = PROVIDER_COOLDOWN_MS): void { providerCooldownUntil.set(name, Date.now() + durationMs); }
function providerCooldownError(name: string): Error { return new Error(name + " provider is in cooldown after a recent quota/model error; retry after " + new Date(providerCooldownUntil.get(name) ?? Date.now()).toISOString()); }

async function boundedJsonFetch(url: string, init: RequestInit, timeoutMs = 90_000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: "error" });
    const text = await response.text();
    if (!response.ok) {
      const detail = text.replace(/\\s+/g, " ").slice(0, 300);
      const error = new Error("Research provider returned HTTP " + response.status + (detail ? ": " + detail : "")) as Error & { status?: number; retryAfterMs?: number };
      error.status = response.status;
      const retryAfter = Number(response.headers.get("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = Math.min(retryAfter * 1000, 10 * 60_000);
      throw error;
    }
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
  const name = "OpenAI";
  if (providerCoolingDown(name)) throw providerCooldownError(name);
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  let payload: any;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      payload = await boundedJsonFetch("https://api.openai.com/v1/responses", {
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
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const status = (error as Error & { status?: number }).status;
      if (status === 429 || /HTTP 429|insufficient_quota|rate limit/i.test(message)) {
        if (/insufficient_quota|current quota|billing hard limit|quota exceeded/i.test(message)) {
          cooldownProvider(name, 6 * 60 * 60_000);
          throw new Error("OpenAI account quota/billing limit reached; automated calls paused for six hours. Check API billing/quota before retrying. " + message.slice(0, 220));
        }
        if (attempt < 2) {
          const retryAfter = (error as Error & { retryAfterMs?: number }).retryAfterMs;
          await new Promise((resolve) => setTimeout(resolve, retryAfter ?? 1000 * (2 ** attempt)));
          continue;
        }
        cooldownProvider(name, (error as Error & { retryAfterMs?: number }).retryAfterMs ?? PROVIDER_COOLDOWN_MS);
      }
      throw error;
    }
  }
  if (lastError) throw lastError;
  const text = extractOpenAiText(payload);
  if (!text) throw new Error("OpenAI returned no research text");
  return { provider: "OpenAI web_search", text };
}

async function listAvailableGeminiModels(key: string): Promise<string[]> {
  const payload = await boundedJsonFetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(key), {
    method: "GET", headers: { accept: "application/json" },
  }, 20_000);
  return (payload?.models ?? [])
    .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
    .map((m: any) => String(m.name ?? "").replace(/^models\//, ""))
    .filter((name: string) => /^gemini-[a-z0-9.-]+$/i.test(name));
}

async function callGeminiModel(key: string, model: string, prompt: string): Promise<any> {
  return boundedJsonFetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 6000 },
    }),
  }, 180_000);
}

async function researchWithGemini(prompt: string): Promise<{provider:string;text:string}> {
  const name = "Gemini";
  if (providerCoolingDown(name)) throw providerCooldownError(name);
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const configuredModel = process.env.FBI_SECURITY_GEMINI_MODEL?.trim();
  let model = configuredModel || "gemini-2.5-pro";
  let payload: any;
  try {
    payload = await callGeminiModel(key, model, prompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = (error as Error & { status?: number }).status;
    if (status === 404 || /HTTP 404|not found/i.test(message)) {
      let available: string[];
      try {
        available = await listAvailableGeminiModels(key);
      } catch (listError) {
        cooldownProvider(name);
        const detail = listError instanceof Error ? listError.message : String(listError);
        throw new Error("Gemini model returned 404 and model discovery failed; provider paused to avoid repeated failures. " + detail.slice(0, 220));
      }
      const preferred = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"];
      const fallback = preferred.find((candidate) => available.includes(candidate))
        ?? available.find((candidate) => /flash/i.test(candidate))
        ?? available[0];
      if (!fallback || fallback === model) {
        cooldownProvider(name);
        throw new Error("Gemini model returned 404 and no alternate generateContent model was available for this API key.");
      }
      model = fallback;
      try {
        payload = await callGeminiModel(key, model, prompt);
      } catch (fallbackError) {
        const fallbackStatus = (fallbackError as Error & { status?: number }).status;
        if (fallbackStatus === 404 || fallbackStatus === 429) cooldownProvider(name);
        throw fallbackError;
      }
    } else if (status === 429 || /HTTP 429|quota|rate limit/i.test(message)) {
      cooldownProvider(name, (error as Error & { retryAfterMs?: number }).retryAfterMs ?? PROVIDER_COOLDOWN_MS);
      throw error;
    } else {
      throw error;
    }
  }
  const text = (payload?.candidates?.[0]?.content?.parts ?? []).map((p: any) => typeof p.text === "string" ? p.text : "").join("\n").slice(0, 20_000);
  if (!text) throw new Error("Gemini returned no research text");
  return { provider: "Gemini Google Search (" + model + ")", text };
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

function researchPrompt(title: string, officialUrl: string, officialText: string, round: number, prior: string, casePlanInstructions: string): string {
  return [
    "Produce a useful, case-specific, source-cited public intelligence brief about the individual explicitly named in this official U.S. federal wanted/enforcement notice. Do not return a generic directory summary.",
    "Starting official notice: " + officialUrl,
    "Notice title: " + title,
    "Official notice excerpt: " + officialText.slice(0, 6500),
    "Research round: " + round + " of " + RESEARCH_MAX_ROUNDS + ".",
    "Previously discovered leads and findings: " + (prior || "No earlier research results; begin from the official notice."),
    "STRUCTURED CASE-SCOPED RESEARCH PLAN AND EVIDENCE RULES:\\n" + casePlanInstructions,
    "Research the named subject and this exact case across the public web. Collect and organize all discoverable, relevant public case records and reporting dated from 2020-01-01 through 2026-12-31, including filings, indictments, complaints, press releases, court milestones, enforcement actions, reward announcements/changes, and status updates. Build a dated 2020–2026 timeline; do not imply a case began in this window if the official record says otherwise. Follow relevant links and pursue promising leads, prioritizing official FBI/DOJ/USMS/court/regulator records and reputable independent news. Search disclosed aliases only when the official notice or reliable case sources connect them. Use earlier records only when needed to establish the same case's context, and later records only to verify current status; label those records outside the requested window. Check the official notice's current status and latest dated update.",
    "REQUIRED OUTPUT, using these exact headings: SUBJECT AND CASE; WHAT WAS FOUND; PUBLIC CASE TIMELINE; CASE STATUS; REWARD VERIFICATION; SOURCE-BY-SOURCE COMPARISON; UNRESOLVED DISCREPANCIES; NEXT PUBLIC SOURCES TO CHECK.",
    "SUBJECT AND CASE: identify only the subject as named in the official notice, relevant disclosed aliases, official case/reference numbers, agency, alleged conduct as described by sources, and clear identity-match reasoning. Give a useful descriptive summary of the publicly documented case, not generic filler.",
    "WHAT WAS FOUND: list concrete case-relevant facts and developments from reliable sources, with source title, publication/update date, direct URL, and the exact fact supported. Distinguish confirmed public-record facts, allegations, reporting, and inference. Explain why each lead relates to this same case; do not merge people merely because names match. If a reliable source directly links the named subject to a company or licensed business, investigate that entity using official Secretary of State/corporate registry records, SEC EDGAR, regulator enforcement pages, court records, and the relevant state professional/business-license lookup. Report entity name, jurisdiction, public filing/status dates, registered business address only when it is the entity's official registered office, public officers/roles only where officially listed, business type, filings, enforcement actions, and official website. Clearly distinguish a confirmed ownership/role link from a same-name match or an unverified lead.",
    "REWARD VERIFICATION IS MANDATORY: extract the exact reward amount and conditions from the primary official notice, including currency, maximum vs fixed amount, eligibility, deadline, and qualifying information if stated. Then compare against at least two independent reliable sources where available (prefer official agency pages/releases and court or agency records; reputable news only as secondary corroboration). Give each source's exact amount/wording, date, URL, and whether it agrees, conflicts, or does not mention a reward. State a verdict: VERIFIED AGAINST MULTIPLE SOURCES, OFFICIAL SOURCE ONLY—NOT INDEPENDENTLY CORROBORATED, CONFLICTING AMOUNTS—HUMAN REVIEW REQUIRED, or NO REWARD STATED IN THE OFFICIAL NOTICE. Never invent an amount. If fewer than two reliable sources exist, say exactly which sources were checked and what additional evidence is needed; do not write 'unknown' or imply verification.",
    "If a page is unavailable or no reliable corroboration is found, report the concrete limitation and what was checked; never substitute 'unknown', 'N/A', or a generic answer for the research. A missing result is not proof that information does not exist.",
    "Search only information legitimately published for public access and relevant to this exact public case. You may list official company websites, public corporate filings, public business contact channels, and clearly official business/social-media accounts that the company itself publishes. For the named subject, include only social profiles that the official case notice or reliable case reporting explicitly identifies as relevant to the case; do not infer ownership from a similar name or photo. Do NOT query or seek Social Security Administration/SSN records, IRS/tax records, restricted licensing systems, private databases, relatives/family trees, genealogy/family-tree search sites, home addresses, personal phone numbers, personal emails, precise/private locations, private social accounts, people-search or data-broker profiles including Whitepages, TruePeopleSearch, Extended, or similar services, private identifiers, or unrelated personal details. Do not use people-search listings or an address appearing in a broker database to confirm that a named person is the FBI-notice subject or that the person resides at that address. Do not build a family tree or aggregate relatives. Establish case identity only through the official notice and independent reliable public reporting or court/regulator records that directly tie the person to the same case; explain conflicts and same-name ambiguity. Do not identify or accuse a person from a name/photo resemblance alone. For public business records, use official state corporate registries and licensing lookup pages; describe a registry as unavailable when it is not public or accessible rather than attempting to bypass access controls.",
    "Finish with a concise source list and confidence assessment grounded in the actual evidence. Explicitly state when a claim is not corroborated. Do not recommend contacting, confronting, tracking, or surveilling anyone; do not submit tips automatically."
  ].join("\n\n");
}

async function runCaseResearch(caseId: string, title: string, officialUrl: string, officialText: string, runKey: string, casePlanInstructions: string): Promise<number> {
  await ensureResearchSchema();
  const enabled = Boolean(process.env.OPENAI_API_KEY?.trim()) || Boolean((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GEMINI_API_KEY)?.trim());
  if (!enabled) {
    logger.warn({ caseId }, "FBI Security AI-assisted research skipped: configure OPENAI_API_KEY and/or GEMINI_API_KEY");
    return 0;
  }
  const started = Date.now();
  let completed = 0;
  let failedProviderRuns = 0;
  let prior = "";
  const maxRounds = Math.max(1, Math.min(RESEARCH_MAX_ROUNDS, Number(process.env.FBI_SECURITY_RESEARCH_ROUNDS ?? RESEARCH_MAX_ROUNDS) || RESEARCH_MAX_ROUNDS));
  for (let round = 1; round <= maxRounds && Date.now() - started < RESEARCH_MAX_MS; round++) {
    const prompt = researchPrompt(title, officialUrl, officialText, round, prior, casePlanInstructions);
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
        failedProviderRuns++;
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
     VALUES($3,$1,$2::jsonb,now())`,
    [caseId, JSON.stringify({ providers: [...(process.env.OPENAI_API_KEY?.trim() ? ["OpenAI"] : []), ...((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GEMINI_API_KEY)?.trim() ? ["Gemini"] : [])], rounds: maxRounds, completedProviderRuns: completed, failedProviderRuns, researchStatus: completed > 0 && failedProviderRuns === 0 ? "provider_calls_completed_not_independently_verified" : completed > 0 ? "partial_provider_failure" : "failed_or_incomplete", elapsedMs: Date.now() - started }), completed > 0 && failedProviderRuns === 0 ? "ai_public_web_research_completed" : completed > 0 ? "ai_public_web_research_partial" : "ai_public_web_research_failed_or_incomplete"],
  );
  return completed;
}

async function pollConfiguredOfficialUrls(): Promise<number> {
  // FBI-only discovery: this exact category index is the only seed. External public sources are researched only after an individual profile is parsed.
  const configured = [FBI_FRAUDSTERS_INDEX];
  const queued = new Set(configured);
  let imported = 0;
  for (const rawUrl of configured) {
    if (Date.now() - currentRunStartedAt >= RESEARCH_MAX_MS) break;
    let url: URL;
    try { url = new URL(rawUrl); } catch { continue; }
    const source = url.hostname.toLowerCase() === "www.fbi.gov" && url.pathname.toLowerCase().startsWith("/wanted/")
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
      if (url.pathname.toLowerCase() === "/wanted/most-wanted-fraudsters" && configured.length < 60) {
        const anchors = raw.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi);
        for (const match of anchors) {
          if (configured.length >= 60) break;
          try {
            const link = new URL(match[1], url);
            const host = link.hostname.toLowerCase();
            const path = link.pathname.toLowerCase();
            const individual = host === "www.fbi.gov"
              && /^\/wanted\/(?:[^/]+\/){1,4}[^/]+\/?$/i.test(path)
              && !/\/(?:index|search|most-wanted-fraudsters|ten-most-wanted-fugitives|fugitives)\/?$/i.test(path);
            // Discovery never leaves the official FBI fraudsters index.
            if (link.protocol === "https:" && host === "www.fbi.gov" && !link.username && !link.password && !link.port && individual && !queued.has(link.toString())) {
              queued.add(link.toString());
              configured.push(link.toString());
            }
          } catch { /* Ignore malformed links. */ }
        }
        // Rotate the profile order each hourly run so the per-run research cap
        // cannot permanently starve the last entries in the FBI category.
        const discoveredProfiles = configured.splice(1);
        if (discoveredProfiles.length > 0) {
          const offset = Math.floor(Date.now() / INTERVAL_MS) % discoveredProfiles.length;
          configured.push(...discoveredProfiles.slice(offset), ...discoveredProfiles.slice(0, offset));
        }
      }
      if (Buffer.byteLength(raw, "utf8") > 2_000_000) continue;
      // The index is only a discovery page, never a case record.
      const individualNotice = /^\/wanted\/(?:[^/]+\/){1,4}[^/]+\/?$/i.test(url.pathname)
        && !/^\/wanted\/most-wanted-fraudsters\/?$/i.test(url.pathname)
        && !/\/(?:index|search|ten-most-wanted-fugitives|fugitives)\/?$/i.test(url.pathname);
      if (!individualNotice) continue;
      const parsedProfile = parseFbiWantedProfileHtml(raw, url.toString());
      const title = parsedProfile.title.slice(0, 500);
      const text = parsedProfile.fullVisibleText.slice(0, 20_000);
      if (text.length < 100 || !title || title.split(/\s+/).length < 2 || parsedProfile.extractionWarnings.some((warning) => warning.includes("Person-name title"))) continue;
      const rewardText = parsedProfile.reward.exactText;
      const amount = parsedProfile.reward.amountText;
      const reward = Boolean(rewardText && amount);
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
      if (individualNotice && researchedCasesThisRun < RESEARCH_MAX_CASES && Date.now() - currentRunStartedAt < RESEARCH_MAX_MS) {
        researchedCasesThisRun++;
        try {
          const researchPlan = buildCaseResearchPlan(parsedProfile);
          const casePlanInstructions = buildResearchInstructions(parsedProfile, researchPlan);
          await runCaseResearch(id, title, canonical, text, new Date().toISOString().slice(0, 13), casePlanInstructions);
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
  // Hard stop: this feature must never send email while disabled.
  void to;
  void importedCount;
  void day;
  return;
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
              WHERE r.case_id=c.id AND r.status='completed' AND r.created_at >= now() - interval '1 hour') AS research_summary,
             (SELECT CASE
                WHEN count(*) FILTER (WHERE r.status='completed') > 0 AND count(*) FILTER (WHERE r.status='failed') = 0 THEN 'provider_calls_completed'
                WHEN count(*) FILTER (WHERE r.status='completed') > 0 AND count(*) FILTER (WHERE r.status='failed') > 0 THEN 'partial_provider_failure'
                WHEN count(*) FILTER (WHERE r.status='failed') > 0 THEN 'provider_calls_failed'
                ELSE 'not_run'
              END
              FROM redom_fbi_security_research_runs r
              WHERE r.case_id=c.id AND r.created_at >= now() - interval '1 hour') AS research_status,
             (SELECT string_agg(r.provider || ': ' || left(COALESCE(r.error_message,'provider error'), 300), E'\\n' ORDER BY r.created_at DESC)
              FROM redom_fbi_security_research_runs r
              WHERE r.case_id=c.id AND r.status='failed' AND r.created_at >= now() - interval '1 hour') AS research_errors
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
      const researchHeading = item.research_status === "provider_calls_completed"
        ? "AI-assisted source research — provider calls completed; findings still require source verification and human review"
        : item.research_status === "partial_provider_failure"
          ? "PARTIAL RESEARCH — some provider calls failed; this is not a complete research result"
          : item.research_status === "provider_calls_failed"
            ? "RESEARCH FAILED — provider calls failed; no completed findings are available"
            : "RESEARCH INCOMPLETE — no completed research runs are stored";
      const researchBody = item.research_summary
        ? `<p><strong>${researchHeading}:</strong><br>${escapeHtml(item.research_summary).replace(/\\n/g, "<br>")}</p>`
        : `<p><strong>${researchHeading}.</strong> A missing result is not evidence that no related public information exists.</p>`;
      const researchErrors = item.research_errors
        ? `<p><strong>Provider errors (diagnostic):</strong><br>${escapeHtml(item.research_errors).replace(/\\n/g, "<br>")}</p>`
        : "";
      const research = researchBody + researchErrors;
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
