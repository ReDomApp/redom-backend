import { createHash, createHmac } from "node:crypto";
import { Resend } from "resend";
import { env } from "../../config/env";
import { pool } from "../../database/db";
import { logger } from "../../lib/logger";

const resend = new Resend(env.email.resend.apiKey);
const RECIPIENT = process.env.REDOM_OPS_REPORT_RECIPIENT?.trim() || "christianuzamaosahuo@gmail.com";
const REPORT_FROM = process.env.REDOM_OPS_REPORT_FROM?.trim() || "admin@wnncompany.com";
const REPORT_TIMEZONE = process.env.REDOM_OPS_REPORT_TIMEZONE?.trim() || "UTC";
const DAILY_LIMIT = positiveInt(process.env.REDOM_EMAIL_DAILY_LIMIT);
const MONTHLY_LIMIT = positiveInt(process.env.REDOM_EMAIL_MONTHLY_LIMIT);
const GEMINI_MODEL = process.env.REDOM_OPS_GEMINI_MODEL || "gemini-2.5-flash";
const REPORT_SIGNING_KEY = process.env.REDOM_OPS_REPORT_SIGNING_KEY?.trim() || "";
let timer: NodeJS.Timeout | undefined;
let inProcess = false;

function positiveInt(value?: string): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
function num(value: unknown): number { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function pct(current: number, previous: number): number | null { return previous === 0 ? null : Math.round(((current - previous) / previous) * 10000) / 100; }
function iso(d: Date): string { return d.toISOString(); }
function esc(s: unknown): string { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function moneyless(n: number): string { return Math.round(n).toLocaleString("en-US"); }
function emailMetric(value: number, metrics: Metrics): string { return metrics.email.ledgerCoverageStart ? moneyless(value) + " (recorded)" : "Unavailable — no email event history"; }

export async function ensureOpsIntelligenceSchema(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS redom_ops_email_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), logical_email_id text NOT NULL, provider_message_id text,
    subsystem varchar(80) NOT NULL, event_type varchar(40) NOT NULL, recipient_domain varchar(255), case_id uuid,
    idempotency_key text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, occurred_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT redom_ops_email_event_type_check CHECK (event_type IN ('queued','attempted','accepted','delivered','deferred','bounced','rejected','failed','duplicate_suppressed','duplicate_delivery','complained'))
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS redom_ops_email_events_time_idx ON redom_ops_email_events(occurred_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS redom_ops_email_events_logical_idx ON redom_ops_email_events(logical_email_id, occurred_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS redom_ops_email_events_subsystem_idx ON redom_ops_email_events(subsystem, occurred_at DESC)");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS redom_ops_email_events_idempotency_idx ON redom_ops_email_events(idempotency_key) WHERE idempotency_key IS NOT NULL");
  await pool.query("CREATE INDEX IF NOT EXISTS redom_ops_email_events_provider_idx ON redom_ops_email_events(provider_message_id) WHERE provider_message_id IS NOT NULL");
  await pool.query(`CREATE TABLE IF NOT EXISTS redom_ops_incidents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_key text NOT NULL UNIQUE, title text NOT NULL, subsystem varchar(100) NOT NULL,
    severity varchar(20) NOT NULL DEFAULT 'warning', status varchar(24) NOT NULL DEFAULT 'open', description text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb, root_cause text, resolution text, verification_evidence text,
    first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
    verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT redom_ops_incident_severity_check CHECK (severity IN ('info','warning','high','critical')),
    CONSTRAINT redom_ops_incident_status_check CHECK (status IN ('open','investigating','mitigated','resolved','closed'))
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS redom_ops_incidents_status_idx ON redom_ops_incidents(status, severity, last_seen_at DESC)");
  await pool.query(`CREATE TABLE IF NOT EXISTS redom_ops_report_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_key text NOT NULL UNIQUE, period_start timestamptz NOT NULL, period_end timestamptz NOT NULL,
    timezone varchar(80) NOT NULL DEFAULT 'UTC', status varchar(24) NOT NULL DEFAULT 'running', metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    analysis jsonb NOT NULL DEFAULT '{}'::jsonb, data_coverage jsonb NOT NULL DEFAULT '{}'::jsonb, pdf_base64 text, pdf_sha256 text,
    provider_message_id text, delivery_status varchar(24) NOT NULL DEFAULT 'pending', attempt_count integer NOT NULL DEFAULT 0,
    error_message text, generated_at timestamptz, delivered_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT redom_ops_report_status_check CHECK (status IN ('running','generated','sent','failed')),
    CONSTRAINT redom_ops_delivery_status_check CHECK (delivery_status IN ('pending','accepted','delivered','failed','unknown'))
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS redom_ops_report_runs_period_idx ON redom_ops_report_runs(period_end DESC)");
  await pool.query("ALTER TABLE redom_ops_report_runs ADD COLUMN IF NOT EXISTS report_signature text");
  await pool.query("ALTER TABLE redom_ops_report_runs ADD COLUMN IF NOT EXISTS signature_payload_hash text");
  await pool.query("ALTER TABLE redom_ops_report_runs ADD COLUMN IF NOT EXISTS signature_key_id text");
  await pool.query(`CREATE TABLE IF NOT EXISTS redom_ops_admin_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action varchar(80) NOT NULL,
    report_key text, outcome varchar(24) NOT NULL DEFAULT 'success',
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS redom_ops_admin_audit_time_idx ON redom_ops_admin_audit(created_at DESC)");
}

export async function recordOpsAdminAudit(action: string, reportKey: string | null, outcome = "success"): Promise<void> {
  await pool.query("INSERT INTO redom_ops_admin_audit (action,report_key,outcome) VALUES ($1,$2,$3)",
    [action.slice(0,80), reportKey?.slice(0,180) ?? null, outcome.slice(0,24)]);
}

export async function recordOpsEmailEvent(input: {
  logicalEmailId: string; subsystem: string; eventType: "queued" | "attempted" | "accepted" | "delivered" | "deferred" | "bounced" | "rejected" | "failed" | "duplicate_suppressed" | "duplicate_delivery" | "complained";
  recipient?: string | null; providerMessageId?: string | null; caseId?: string | null; idempotencyKey?: string | null; metadata?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(`INSERT INTO redom_ops_email_events
    (logical_email_id, subsystem, event_type, recipient_domain, provider_message_id, case_id, idempotency_key, metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
  [input.logicalEmailId, input.subsystem.slice(0, 80), input.eventType, input.recipient?.split("@").pop()?.toLowerCase() ?? null,
    input.providerMessageId ?? null, input.caseId ?? null, input.idempotencyKey ?? null, JSON.stringify(input.metadata ?? {})]);
}

export async function recordOpsIncident(input: {
  key: string;
  title: string;
  subsystem: string;
  severity?: "info" | "warning" | "high" | "critical";
  description: string;
  evidence?: Record<string, unknown>;
}): Promise<void> {
  const incidentKey = input.key.trim().slice(0, 180);
  if (!incidentKey) return;
  await pool.query(`INSERT INTO redom_ops_incidents
    (incident_key,title,subsystem,severity,status,description,evidence)
    VALUES ($1,$2,$3,$4,'open',$5,$6::jsonb)
    ON CONFLICT (incident_key) DO UPDATE SET
      title=EXCLUDED.title, subsystem=EXCLUDED.subsystem,
      severity=CASE WHEN redom_ops_incidents.status IN ('resolved','closed') THEN EXCLUDED.severity
                    WHEN redom_ops_incidents.severity='critical' THEN 'critical'
                    ELSE EXCLUDED.severity END,
      status=CASE WHEN redom_ops_incidents.status IN ('resolved','closed') THEN 'open' ELSE redom_ops_incidents.status END,
      description=EXCLUDED.description,evidence=EXCLUDED.evidence,
      last_seen_at=now(),updated_at=now(),resolved_at=NULL,verified_at=NULL`,
    [incidentKey, input.title.slice(0, 240), input.subsystem.slice(0, 100), input.severity ?? "high",
      input.description.slice(0, 2000), JSON.stringify(input.evidence ?? {})]);
}

type Metrics = {
  generatedAt: string; periodStart: string; periodEnd: string; timezone: string;
  email: { rolling365Start: string; rolling365End: string; current24h: Record<string, number>; previous24h: Record<string, number>; changePct: Record<string, number | null>; last365d: Record<string, number>; dailyLimit: number | null; monthlyLimit: number | null; dailyLimitUsedPct: number | null; monthlyLimitUsedPct: number | null; monthlySent: number; ledgerCoverageStart: string | null; monthlyTrend: Array<{ month: string; attempts: number; sendAttempts: number; accepted: number; delivered: number; failed: number; bounced: number; rejected: number; deliveryRatePct: number | null; outcomeCoveragePct: number | null }> };
  support: { created24h: number; createdPrevious24h: number; changePct: number | null; open: number; awaitingSupport: number; awaitingUser: number; closed: number; invalidated: number; created365d: number; closed365d: number; activeCaseNumbers: string[]; createdCaseNumbers24h: string[]; invalidCaseNumbers: string[]; monthlyTrend: Array<{ month: string; created: number; closed: number }>; messages24h: number; messagesPrevious24h: number; messagesChangePct: number | null; averageMessagesPerCase: number | null; emailsConsumedByNewCases24h: number; caseLinkedEmailAttempts24h: number; caseEmailBreakdown: Array<{ caseNumber: string; attempts: number; accepted: number; delivered: number; failed: number }>; repeatContactSendersPreviousMonth: Array<{ email: string; messages: number; cases: number }>; priorityReviewCases: Array<{ caseNumber: string; category: string; subject: string; status: string; indicators: string[] }>; failedSupportInbound24h: number; failedRefundOutcomes365d: number; resolvedCaseNumbers365d: string[]; topTopics30d: Array<{ topic: string; count: number }>; topQuestions30d: Array<{ question: string; count: number }> };
  fraud: { reviewedSignals: Array<{ email: string; risk: string; score: number; indicators: string[]; caseNumbers: string[]; count: number; recommendedAction: string }>; signalCount30d: number; previousSignalCount30d: number; changePct30d: number | null; flaggedMessages30d: number; previousFlaggedMessages30d: number; flaggedMessagesChangePct30d: number | null; highReviewPriorityCount: number; manualReviewCount: number; trend30d: "increased" | "decreased" | "unchanged" | "baseline-unavailable"; warning: string };
  geography: { topCountries: Array<{ country: string; signups: number }>; topCities: Array<{ city: string; country: string; signups: number }>; source: string };
  incidents: { open: Array<Record<string, unknown>>; resolved24h: number | null; criticalOpen: number; resolved365d: number; created365d: number; criticalResolved365d: number; criticalCreated365d: number };
  dataCoverage: Record<string, string>;
  forecast: { expectedEmailAttempts24h: number; expectedSupportCases24h: number; notes: string[] };
  system: { database: string; collectedAt: string };
};

async function collectMetrics(now: Date): Promise<Metrics> {
  const start = new Date(now.getTime() - 86400000);
  const prevStart = new Date(now.getTime() - 172800000);
  const yearStart = new Date(now.getTime() - 365 * 86400000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  // The exact rolling year can touch 13 calendar-month buckets; edge buckets are partial.
  const monthSeriesStart = new Date(Date.UTC(yearStart.getUTCFullYear(), yearStart.getUTCMonth(), 1));
  const monthSeriesEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const [email, annual, monthlyTrend, firstEvent, support, messages, caseLifecycle, caseLists, repeatSenders, topics, questions, fraudSignals, fraudCount, caseEmails, supportMonthly, failedSupportOps, priorityCases, geography, incidents, resolvedIncidents, annualIncidents, database] = await Promise.all([
    pool.query(`SELECT
      count(DISTINCT logical_email_id) FILTER (WHERE occurred_at >= $1 AND event_type='attempted')::int AS uniqueEmails,
      count(*) FILTER (WHERE occurred_at >= $1 AND event_type='attempted')::int AS attempts,
      count(DISTINCT COALESCE(provider_message_id, logical_email_id)) FILTER (WHERE occurred_at >= $1 AND event_type='accepted')::int AS accepted,
      count(DISTINCT COALESCE(provider_message_id, logical_email_id)) FILTER (WHERE occurred_at >= $1 AND event_type='delivered')::int AS delivered,
      count(*) FILTER (WHERE occurred_at >= $1 AND event_type='failed')::int AS failed,
      count(*) FILTER (WHERE occurred_at >= $1 AND event_type='bounced')::int AS bounced,
      count(*) FILTER (WHERE occurred_at >= $1 AND event_type='rejected')::int AS rejected,
      count(*) FILTER (WHERE occurred_at >= $1 AND event_type='deferred')::int AS deferred,
      count(*) FILTER (WHERE occurred_at >= $1 AND event_type='duplicate_suppressed')::int AS duplicateSuppressed,
      count(*) FILTER (WHERE occurred_at >= $1 AND event_type='duplicate_delivery')::int AS duplicateDelivery,
      count(*) FILTER (WHERE occurred_at >= $2 AND occurred_at < $1 AND event_type='attempted')::int AS previousAttempts,
      count(DISTINCT COALESCE(provider_message_id, logical_email_id)) FILTER (WHERE occurred_at >= $2 AND occurred_at < $1 AND event_type='delivered')::int AS previousDelivered,
      count(*) FILTER (WHERE occurred_at >= $2 AND occurred_at < $1 AND event_type='failed')::int AS previousFailed,
      count(*) FILTER (WHERE occurred_at >= $3 AND event_type='attempted')::int AS monthlyAttempts
      FROM redom_ops_email_events`, [start, prevStart, monthStart]),
    pool.query(`SELECT
      count(DISTINCT logical_email_id) FILTER (WHERE event_type='attempted')::int AS uniqueEmails,
      count(*) FILTER (WHERE event_type='attempted')::int AS attempts,
      count(DISTINCT COALESCE(provider_message_id, logical_email_id)) FILTER (WHERE event_type='accepted')::int AS accepted,
      count(DISTINCT COALESCE(provider_message_id, logical_email_id)) FILTER (WHERE event_type='delivered')::int AS delivered,
      count(*) FILTER (WHERE event_type='failed')::int AS failed,
      count(*) FILTER (WHERE event_type='bounced')::int AS bounced,
      count(*) FILTER (WHERE event_type='duplicate_suppressed')::int AS duplicateSuppressed
      FROM redom_ops_email_events WHERE occurred_at >= $1`, [yearStart]),
    pool.query(`WITH months AS (
      SELECT generate_series(date_trunc('month',$1::timestamptz), date_trunc('month',$2::timestamptz) - interval '1 month', interval '1 month') AS month_start
    ), stats AS (
      SELECT date_trunc('month',occurred_at) AS month_start,
        count(DISTINCT logical_email_id) FILTER (WHERE event_type='attempted')::int AS attempts,
        count(*) FILTER (WHERE event_type='attempted')::int AS send_attempts,
        count(DISTINCT COALESCE(provider_message_id,logical_email_id)) FILTER (WHERE event_type='accepted')::int AS accepted,
        count(DISTINCT COALESCE(provider_message_id,logical_email_id)) FILTER (WHERE event_type='delivered')::int AS delivered,
        count(DISTINCT COALESCE(provider_message_id,logical_email_id)) FILTER (WHERE event_type='failed')::int AS failed,
        count(DISTINCT COALESCE(provider_message_id,logical_email_id)) FILTER (WHERE event_type='bounced')::int AS bounced,
        count(DISTINCT COALESCE(provider_message_id,logical_email_id)) FILTER (WHERE event_type='rejected')::int AS rejected
      FROM redom_ops_email_events WHERE occurred_at >= $3 AND occurred_at < $4 GROUP BY 1
    )
    SELECT to_char(months.month_start,'YYYY-MM') AS month,
      COALESCE(stats.attempts,0)::int AS attempts,COALESCE(stats.send_attempts,0)::int AS send_attempts,COALESCE(stats.accepted,0)::int AS accepted,
      COALESCE(stats.delivered,0)::int AS delivered,COALESCE(stats.failed,0)::int AS failed,
      COALESCE(stats.bounced,0)::int AS bounced,COALESCE(stats.rejected,0)::int AS rejected,
      CASE WHEN COALESCE(stats.delivered,0)+COALESCE(stats.failed,0)+COALESCE(stats.bounced,0)+COALESCE(stats.rejected,0)>0
        THEN round(100.0*COALESCE(stats.delivered,0)/(stats.delivered+stats.failed+stats.bounced+stats.rejected),2) ELSE NULL END AS delivery_rate_pct,
      CASE WHEN COALESCE(stats.send_attempts,0)>0 THEN LEAST(100.0, round(100.0*(COALESCE(stats.delivered,0)+COALESCE(stats.failed,0)+COALESCE(stats.bounced,0)+COALESCE(stats.rejected,0))/stats.send_attempts,2)) ELSE NULL END AS outcome_coverage_pct
    FROM months LEFT JOIN stats USING(month_start) ORDER BY months.month_start`, [monthSeriesStart,monthSeriesEnd,yearStart,now]),
    pool.query("SELECT min(occurred_at) AS first_at FROM redom_ops_email_events"),
    pool.query(`SELECT
      count(*) FILTER (WHERE created_at >= $1)::int AS created,
      count(*) FILTER (WHERE created_at >= $2 AND created_at < $1)::int AS previousCreated,
      count(*) FILTER (WHERE status <> 'closed' AND NOT EXISTS (SELECT 1 FROM refund_requests rr WHERE rr.case_id=support_cases.id AND rr.case_invalidated_at IS NOT NULL))::int AS open,
      count(*) FILTER (WHERE status = 'awaiting_support')::int AS awaitingSupport,
      count(*) FILTER (WHERE status = 'awaiting_user')::int AS awaitingUser,
      count(*) FILTER (WHERE status = 'closed')::int AS closed
      FROM support_cases`, [start, prevStart]),
    pool.query(`SELECT
      count(*) FILTER (WHERE created_at >= $1)::int AS currentMessages,
      count(*) FILTER (WHERE created_at >= $2 AND created_at < $1)::int AS previousMessages
      FROM support_case_messages WHERE created_at >= $2`, [start, prevStart]),
    pool.query(`SELECT
      count(*) FILTER (WHERE created_at >= $1)::int AS created365d,
      count(*) FILTER (WHERE closed_at >= $1 OR (status='closed' AND updated_at >= $1))::int AS closed365d,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM refund_requests rr WHERE rr.case_id=support_cases.id AND rr.case_invalidated_at IS NOT NULL))::int AS invalidated,
      count(*) FILTER (WHERE status <> 'closed' AND NOT EXISTS (SELECT 1 FROM refund_requests rr WHERE rr.case_id=support_cases.id AND rr.case_invalidated_at IS NOT NULL))::int AS active
      FROM support_cases`, [yearStart]),
    pool.query(`SELECT
      COALESCE(array_agg(case_number::text ORDER BY created_at DESC) FILTER (WHERE created_at >= $1), ARRAY[]::text[]) AS created_numbers,
      COALESCE(array_agg(case_number::text ORDER BY updated_at DESC) FILTER (WHERE status <> 'closed' AND NOT EXISTS (SELECT 1 FROM refund_requests rr WHERE rr.case_id=support_cases.id AND rr.case_invalidated_at IS NOT NULL)), ARRAY[]::text[]) AS active_numbers,
      COALESCE(array_agg(case_number::text ORDER BY updated_at DESC) FILTER (WHERE EXISTS (SELECT 1 FROM refund_requests rr WHERE rr.case_id=support_cases.id AND rr.case_invalidated_at IS NOT NULL)), ARRAY[]::text[]) AS invalid_numbers,
      COALESCE(array_agg(case_number::text ORDER BY closed_at DESC) FILTER (WHERE status='closed' AND closed_at >= $2), ARRAY[]::text[]) AS resolved_numbers
      FROM support_cases WHERE created_at >= $2 OR status <> 'closed' OR EXISTS (SELECT 1 FROM refund_requests rr WHERE rr.case_id=support_cases.id AND rr.case_invalidated_at IS NOT NULL)`, [start,yearStart]),
    pool.query(`SELECT lower(COALESCE(NULLIF(sc.requester_email,''),NULLIF(m.sender_email,''))) AS email,
      count(*)::int AS messages,count(DISTINCT sc.id)::int AS cases
      FROM support_case_messages m JOIN support_cases sc ON sc.id=m.case_id
      WHERE m.sender_type='user' AND m.created_at >= $1 AND m.created_at < $2
        AND COALESCE(NULLIF(sc.requester_email,''),NULLIF(m.sender_email,'')) IS NOT NULL
      GROUP BY 1 HAVING count(*) >= 3
      ORDER BY count(*) DESC LIMIT 20`, [previousMonthStart, monthStart]),
    pool.query(`SELECT COALESCE(NULLIF(category,''),'uncategorized') AS topic,count(*)::int AS count
      FROM support_cases WHERE created_at >= $1 GROUP BY 1 ORDER BY count(*) DESC LIMIT 12`, [thirtyDaysAgo]),
    pool.query(`SELECT regexp_replace(trim(subject),'[[:space:]]+',' ','g') AS question,count(*)::int AS count
      FROM support_cases WHERE created_at >= $1 AND COALESCE(trim(subject),'') <> ''
      GROUP BY 1 ORDER BY count(*) DESC LIMIT 15`, [thirtyDaysAgo]),
    pool.query(`WITH candidate AS (
      SELECT lower(COALESCE(NULLIF(sc.requester_email,''),NULLIF(m.sender_email,''))) AS email,
        sc.case_number,sc.category,sc.subject,m.body,m.created_at
      FROM support_case_messages m JOIN support_cases sc ON sc.id=m.case_id
      WHERE m.sender_type='user' AND m.created_at >= $1
        AND COALESCE(NULLIF(sc.requester_email,''),NULLIF(m.sender_email,'')) IS NOT NULL
        AND (m.body ~* '(api[ -]?key|secret key|access token|password|credential|bypass.{0,30}(security|verification|payment)|fake.{0,20}(receipt|payment|refund)|forge.{0,20}(receipt|transaction)|steal.{0,20}(account|token)|exploit.{0,20}(api|payment)|refund.{0,20}(without|bypass|verification))'
          OR sc.category='refund_payment' AND m.body ~* '(not my transaction|different account|fake|bypass|without verification|change.*receipt)')
    )
    SELECT email,count(*)::int AS count,count(DISTINCT case_number)::int AS case_count,
      array_agg(DISTINCT case_number) AS cases,
      bool_or(body ~* '(api[ -]?key|secret key|access token|password|credential|bypass.{0,30}(security|verification|payment)|steal.{0,20}(account|token)|exploit.{0,20}(api|payment))') AS credential_or_bypass,
      bool_or(body ~* '(fake.{0,20}(receipt|payment|refund)|forge.{0,20}(receipt|transaction)|not my transaction|different account|change.*receipt)') AS payment_integrity
    FROM candidate GROUP BY email HAVING count(*) >= 1 ORDER BY count(*) DESC LIMIT 25`, [thirtyDaysAgo]),
    pool.query(`SELECT
      count(DISTINCT lower(COALESCE(NULLIF(sc.requester_email,''),NULLIF(m.sender_email,'')))) FILTER (WHERE m.created_at >= $1)::int AS current_senders,
      count(*) FILTER (WHERE m.created_at >= $1)::int AS current_messages,
      count(DISTINCT lower(COALESCE(NULLIF(sc.requester_email,''),NULLIF(m.sender_email,'')))) FILTER (WHERE m.created_at >= $2 AND m.created_at < $1)::int AS previous_senders,
      count(*) FILTER (WHERE m.created_at >= $2 AND m.created_at < $1)::int AS previous_messages
      FROM support_case_messages m JOIN support_cases sc ON sc.id=m.case_id
      WHERE m.sender_type='user' AND m.created_at >= $2 AND
      (m.body ~* '(api[ -]?key|secret key|access token|password|credential|bypass.{0,30}(security|verification|payment)|fake.{0,20}(receipt|payment|refund)|forge.{0,20}(receipt|transaction)|steal.{0,20}(account|token)|exploit.{0,20}(api|payment)|refund.{0,20}(without|bypass|verification))'
        OR sc.category='refund_payment' AND m.body ~* '(not my transaction|different account|fake|bypass|without verification|change.*receipt)')`, [thirtyDaysAgo,new Date(now.getTime()-60*86400000)]),
    pool.query(`SELECT c.case_number,
      count(*) FILTER (WHERE e.event_type='attempted')::int AS attempts,
      count(*) FILTER (WHERE e.event_type='accepted')::int AS accepted,
      count(*) FILTER (WHERE e.event_type='delivered')::int AS delivered,
      count(*) FILTER (WHERE e.event_type='failed')::int AS failed
      FROM redom_ops_email_events e
      JOIN support_cases c ON c.id=e.case_id
      WHERE c.created_at >= $1 AND e.occurred_at >= $1
      GROUP BY c.case_number ORDER BY count(*) FILTER (WHERE e.event_type='attempted') DESC, c.case_number LIMIT 20`, [start]),
    pool.query(`WITH months AS (
      SELECT generate_series(date_trunc('month',$1::timestamptz), date_trunc('month',$2::timestamptz) - interval '1 month', interval '1 month') AS month_start
    ), created AS (
      SELECT date_trunc('month',created_at) AS month_start,count(*)::int AS total
      FROM support_cases WHERE created_at >= $1 AND created_at < $2 GROUP BY 1
    ), closed AS (
      SELECT date_trunc('month',closed_at) AS month_start,count(*)::int AS total
      FROM support_cases WHERE closed_at >= $1 AND closed_at < $2 GROUP BY 1
    )
    SELECT to_char(months.month_start,'YYYY-MM') AS month,COALESCE(created.total,0)::int AS created,COALESCE(closed.total,0)::int AS closed
    FROM months LEFT JOIN created USING(month_start) LEFT JOIN closed USING(month_start)
    ORDER BY months.month_start`, [monthSeriesStart,monthSeriesEnd]),
    pool.query(`SELECT
      (SELECT count(*)::int FROM support_inbound_events WHERE status='failed' AND created_at >= $1) AS failed_inbound_24h,
      (SELECT count(*)::int FROM refund_transaction_locks WHERE outcome_status='refund_failed' AND updated_at >= $2) AS failed_refund_outcomes_365d`, [start,yearStart]),
    pool.query(`SELECT sc.case_number,COALESCE(NULLIF(sc.category,''),'uncategorized') AS category,
      COALESCE(NULLIF(sc.subject,''),'(no subject)') AS subject,sc.status,
      array_remove(ARRAY[
        CASE WHEN COALESCE(sc.subject,'') ~* '(account takeover|unauthori[sz]ed access|data breach|api[ -]?key leak|credential leak|production down|major outage|security vulnerability|exploit)' THEN 'security/service continuity keywords in subject' END,
        CASE WHEN COALESCE(sc.category,'') ~* '(security|fraud|payment|refund)' THEN 'security/payment-sensitive category' END,
        CASE WHEN COALESCE(string_agg(m.body,' '),'') ~* '(account takeover|unauthori[sz]ed access|data breach|api[ -]?key leak|credential leak|production down|major outage|security vulnerability|exploit|payment fraud|forged receipt)' THEN 'security/payment-risk keywords in user messages' END
      ],NULL) AS indicators
      FROM support_cases sc LEFT JOIN support_case_messages m ON m.case_id=sc.id AND m.sender_type='user'
      WHERE sc.status <> 'closed' AND NOT EXISTS (SELECT 1 FROM refund_requests rr WHERE rr.case_id=sc.id AND rr.case_invalidated_at IS NOT NULL)
      GROUP BY sc.id,sc.case_number,sc.category,sc.subject,sc.status
      HAVING COALESCE(sc.subject,'') ~* '(account takeover|unauthori[sz]ed access|data breach|api[ -]?key leak|credential leak|production down|major outage|security vulnerability|exploit)'
        OR COALESCE(sc.category,'') ~* '(security|fraud|payment|refund)'
        OR COALESCE(string_agg(m.body,' '),'') ~* '(account takeover|unauthori[sz]ed access|data breach|api[ -]?key leak|credential leak|production down|major outage|security vulnerability|exploit|payment fraud|forged receipt)'
      ORDER BY sc.created_at DESC LIMIT 50`),
    pool.query(`WITH locations AS (
      SELECT COALESCE(NULLIF(memory->'networkSecurity'->>'country',''),NULLIF(ip_country_code,''),NULLIF(phone_lookup_country_code,''),'Unknown') AS country,
        COALESCE(NULLIF(memory->'networkSecurity'->>'city',''),'Unknown') AS city
      FROM registration_flow_reservations
      WHERE created_at >= $1 AND status IN ('completed','active','blocked')
    )
    SELECT 'country' AS kind,country AS label,'' AS country,count(*)::int AS count FROM locations GROUP BY country
    UNION ALL
    SELECT 'city' AS kind,city AS label,country,count(*)::int AS count FROM locations WHERE city <> 'Unknown' GROUP BY city,country
    ORDER BY count DESC LIMIT 30`, [yearStart]),
    pool.query(`SELECT id, incident_key, title, subsystem, severity, status, description, root_cause, resolution,
      verification_evidence, first_seen_at, last_seen_at, resolved_at, verified_at
      FROM redom_ops_incidents WHERE status NOT IN ('closed','resolved') ORDER BY
      CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END, last_seen_at DESC LIMIT 30`),
    pool.query(`SELECT count(*)::int AS resolved FROM redom_ops_incidents WHERE status IN ('resolved','closed') AND resolved_at >= $1`, [start]),
    pool.query(`SELECT count(*) FILTER (WHERE status IN ('resolved','closed') AND resolved_at >= $1)::int AS resolved,
      count(*) FILTER (WHERE created_at >= $1)::int AS created,
      count(*) FILTER (WHERE severity='critical' AND created_at >= $1)::int AS critical_created,
      count(*) FILTER (WHERE severity='critical' AND status IN ('resolved','closed') AND resolved_at >= $1)::int AS critical_resolved
      FROM redom_ops_incidents`, [yearStart]),
    pool.query("SELECT 1 AS ok"),
  ]);
  const e = email.rows[0] ?? {}, y = annual.rows[0] ?? {}, s = support.rows[0] ?? {}, m = messages.rows[0] ?? {};
  const lifecycle = caseLifecycle.rows[0] ?? {};
  const attempts = num(e.attempts), previousAttempts = num(e.previousattempts), delivered = num(e.delivered), failed = num(e.failed);
  const monthlySent = num(e.monthlyattempts);
  const supportCreated = num(s.created), previousSupport = num(s.previouscreated);
  const cases = num(s.created);
  const openIncidents = incidents.rows as Array<Record<string, unknown>>;
  const expectedEmail = Math.round(Math.max(0, attempts) * 0.75 + Math.max(0, previousAttempts) * 0.25);
  const expectedCases = Math.round(supportCreated * 0.7 + previousSupport * 0.3);
  const ledgerHasData = Boolean(firstEvent.rows[0]?.first_at);
  const dailyUsedPct = ledgerHasData && DAILY_LIMIT ? Math.round((attempts / DAILY_LIMIT) * 10000) / 100 : null;
  const monthlyUsedPct = ledgerHasData && MONTHLY_LIMIT ? Math.round((monthlySent / MONTHLY_LIMIT) * 10000) / 100 : null;
  return {
    generatedAt: iso(now), periodStart: iso(start), periodEnd: iso(now), timezone: REPORT_TIMEZONE,
    email: {
      rolling365Start: iso(yearStart), rolling365End: iso(now),
      current24h: { uniqueEmails: num(e.uniqueemails), attempts, accepted: num(e.accepted), delivered, failed, bounced: num(e.bounced), rejected: num(e.rejected), deferred: num(e.deferred), duplicateSuppressed: num(e.duplicatesuppressed), duplicateDelivery: num(e.duplicatedelivery) },
      previous24h: { attempts: previousAttempts, delivered: num(e.previousdelivered), failed: num(e.previousfailed) },
      changePct: { attempts: pct(attempts, previousAttempts), delivered: pct(delivered, num(e.previousdelivered)), failed: pct(failed, num(e.previousfailed)) },
      last365d: { uniqueEmails: num(y.uniqueemails), sendAttempts: num(y.attempts), accepted: num(y.accepted), delivered: num(y.delivered), failed: num(y.failed), bounced: num(y.bounced), duplicateSuppressed: num(y.duplicatesuppressed) },
      dailyLimit: DAILY_LIMIT, monthlyLimit: MONTHLY_LIMIT, dailyLimitUsedPct: dailyUsedPct, monthlyLimitUsedPct: monthlyUsedPct, monthlySent,
      ledgerCoverageStart: firstEvent.rows[0]?.first_at ? iso(new Date(firstEvent.rows[0].first_at)) : null,
      monthlyTrend: monthlyTrend.rows.map((row: Record<string, unknown>) => ({ month: String(row.month), attempts: num(row.attempts), sendAttempts: num(row.send_attempts), accepted: num(row.accepted), delivered: num(row.delivered), failed: num(row.failed), bounced: num(row.bounced), rejected: num(row.rejected), deliveryRatePct: row.delivery_rate_pct === null ? null : num(row.delivery_rate_pct), outcomeCoveragePct: row.outcome_coverage_pct === null ? null : num(row.outcome_coverage_pct) })),
    },
    support: {
      created24h: supportCreated, createdPrevious24h: previousSupport, changePct: pct(supportCreated, previousSupport),
      open: num(s.open), awaitingSupport: num(s.awaitingsupport), awaitingUser: num(s.awaitinguser), closed: num(s.closed),
      invalidated: num(lifecycle.invalidated), created365d: num(lifecycle.created365d), closed365d: num(lifecycle.closed365d),
      activeCaseNumbers: Array.isArray(caseLists.rows[0]?.active_numbers) ? caseLists.rows[0].active_numbers.map(String).slice(0,100) : [],
      createdCaseNumbers24h: Array.isArray(caseLists.rows[0]?.created_numbers) ? caseLists.rows[0].created_numbers.map(String).filter((n: string) => n && n !== "").slice(0,100) : [],
      invalidCaseNumbers: Array.isArray(caseLists.rows[0]?.invalid_numbers) ? caseLists.rows[0].invalid_numbers.map(String).slice(0,100) : [],
      resolvedCaseNumbers365d: Array.isArray(caseLists.rows[0]?.resolved_numbers) ? caseLists.rows[0].resolved_numbers.map(String).slice(0,100) : [],
      failedSupportInbound24h: num(failedSupportOps.rows[0]?.failed_inbound_24h),
      failedRefundOutcomes365d: num(failedSupportOps.rows[0]?.failed_refund_outcomes_365d),
      monthlyTrend: supportMonthly.rows.map((row: Record<string, unknown>) => ({ month: String(row.month), created: num(row.created), closed: num(row.closed) })),
      messages24h: num(m.currentmessages), messagesPrevious24h: num(m.previousmessages), messagesChangePct: pct(num(m.currentmessages), num(m.previousmessages)),
      averageMessagesPerCase: cases ? Math.round((num(m.currentmessages) / cases) * 100) / 100 : null,
      emailsConsumedByNewCases24h: caseEmails.rows.reduce((sum: number, row: Record<string, unknown>) => sum + num(row.attempts), 0),
      caseLinkedEmailAttempts24h: caseEmails.rows.reduce((sum: number, row: Record<string, unknown>) => sum + num(row.attempts), 0),
      caseEmailBreakdown: caseEmails.rows.map((row: Record<string, unknown>) => ({ caseNumber: String(row.case_number), attempts: num(row.attempts), accepted: num(row.accepted), delivered: num(row.delivered), failed: num(row.failed) })),
      repeatContactSendersPreviousMonth: repeatSenders.rows.map((row: Record<string, unknown>) => ({ email: String(row.email), messages: num(row.messages), cases: num(row.cases) })),
      priorityReviewCases: priorityCases.rows.map((row: Record<string, unknown>) => ({ caseNumber: String(row.case_number), category: String(row.category), subject: redactSensitiveText(String(row.subject)).slice(0,180), status: String(row.status), indicators: Array.isArray(row.indicators) ? row.indicators.map(String) : [] })),
      topTopics30d: topics.rows.map((row: Record<string, unknown>) => ({ topic: String(row.topic), count: num(row.count) })),
      topQuestions30d: questions.rows.map((row: Record<string, unknown>) => ({ question: redactSensitiveText(String(row.question)).slice(0,180), count: num(row.count) })),
    },
    fraud: {
      reviewedSignals: fraudSignals.rows.map((row: Record<string, unknown>) => {
        const indicators = [row.credential_or_bypass ? "Requests involving API keys, credentials, or security/payment bypass" : null, row.payment_integrity ? "Potential payment/refund integrity manipulation language" : null].filter(Boolean) as string[];
        const score = Math.min(95, (row.credential_or_bypass ? 55 : 0) + (row.payment_integrity ? 40 : 0) + Math.min(20, Math.max(0, num(row.count) - 1) * 5));
        const recommendedAction = row.credential_or_bypass
          ? "Preserve relevant case evidence; route to Security for context review; provide safe public API documentation only; never disclose secrets. Do not block solely from keyword matches."
          : "Review refund/payment evidence and account ownership through established controls; request normal verification if warranted. No automatic denial or account action.";
        return { email: String(row.email), risk: score >= 75 ? "high-review-priority" : score >= 50 ? "manual-review" : "low-confidence-signal", score, indicators, caseNumbers: Array.isArray(row.cases) ? row.cases.map(String).slice(0,10) : [], count: num(row.count), recommendedAction };
      }),
      signalCount30d: num(fraudCount.rows[0]?.current_senders),
      previousSignalCount30d: num(fraudCount.rows[0]?.previous_senders),
      changePct30d: pct(num(fraudCount.rows[0]?.current_senders), num(fraudCount.rows[0]?.previous_senders)),
      flaggedMessages30d: num(fraudCount.rows[0]?.current_messages),
      previousFlaggedMessages30d: num(fraudCount.rows[0]?.previous_messages),
      flaggedMessagesChangePct30d: pct(num(fraudCount.rows[0]?.current_messages), num(fraudCount.rows[0]?.previous_messages)),
      highReviewPriorityCount: fraudSignals.rows.filter((row: Record<string, unknown>) => (row.credential_or_bypass && row.payment_integrity) || num(row.count) >= 4).length,
      manualReviewCount: fraudSignals.rows.filter((row: Record<string, unknown>) => row.credential_or_bypass || row.payment_integrity).length,
      trend30d: num(fraudCount.rows[0]?.previous_senders) === 0
        ? (num(fraudCount.rows[0]?.current_senders) === 0 ? "unchanged" : "baseline-unavailable")
        : num(fraudCount.rows[0]?.current_senders) > num(fraudCount.rows[0]?.previous_senders) ? "increased"
          : num(fraudCount.rows[0]?.current_senders) < num(fraudCount.rows[0]?.previous_senders) ? "decreased" : "unchanged",
      warning: "These are heuristic review signals, not findings of fraud. Human security review is required. Do not automatically suspend, block, deny refunds, or alter an account based on this report.",
    },
    geography: {
      topCountries: geography.rows.filter((row: Record<string, unknown>) => row.kind === "country").slice(0,10).map((row: Record<string, unknown>) => ({ country: String(row.label), signups: num(row.count) })),
      topCities: geography.rows.filter((row: Record<string, unknown>) => row.kind === "city").slice(0,10).map((row: Record<string, unknown>) => ({ city: String(row.label), country: String(row.country), signups: num(row.count) })),
      source: "Aggregated registration_flow_reservations network/location metadata from the last 365 days. Counts are registrations/reservations, not proof of a user's current physical location; IP-derived locations can be inaccurate.",
    },
    incidents: {
      open: openIncidents, resolved24h: num(resolvedIncidents.rows[0]?.resolved), criticalOpen: openIncidents.filter(i => i.severity === "critical").length,
      resolved365d: num(annualIncidents.rows[0]?.resolved), created365d: num(annualIncidents.rows[0]?.created),
      criticalResolved365d: num(annualIncidents.rows[0]?.critical_resolved), criticalCreated365d: num(annualIncidents.rows[0]?.critical_created),
    },
    dataCoverage: {
      emailLedger: firstEvent.rows[0]?.first_at ? "Available from " + iso(new Date(firstEvent.rows[0].first_at)) + "; only instrumented senders and ingested provider webhook events are represented, so this is not yet a complete platform-wide lifetime ledger." : "No email events recorded yet; email totals are unavailable until send paths and provider webhooks are instrumented.",
      supportCases: "Queried from support_cases; counts reflect persisted records.",
      supportMessages: "Queried from support_case_messages; message counts are not equivalent to email delivery counts.",
      supportCasePriority: "The support_cases schema has no independent severity/priority field. Critical counts refer only to explicitly tracked operations incidents; support cases are not automatically classified as critical.",
      caseExpirationAndRecycling: "Refund invalidation is recorded in refund_requests.case_invalidated_at; support_cases has no distinct expiration timestamp or recycling history. Expired/recycled counts cannot be asserted from current data.",
      caseFailureStatus: "The support_cases status constraint contains awaiting_support, awaiting_user, and closed only; there is no failed-case status. Failed email deliveries and failed tracked incidents are reported separately.",
      applicationLogs: "Not connected to a queryable centralized log aggregation source in this reporting service.",
      providerDeliveryEvents: "Only events ingested into the ReDom operations email ledger are counted.",
      emailOutcomeCoverage: "Outcome coverage is capped at 100%; provider events can exceed instrumented send attempts while legacy send paths remain uninstrumented, so email counts are not yet fully reconciled.",
      limits: DAILY_LIMIT || MONTHLY_LIMIT ? "Only configured REDOM_EMAIL_DAILY_LIMIT / REDOM_EMAIL_MONTHLY_LIMIT values are shown." : "Provider quotas are not yet connected; no quota value is assumed.",
    },
    forecast: {
      expectedEmailAttempts24h: expectedEmail, expectedSupportCases24h: expectedCases,
      notes: ["Simple weighted estimate based on the current and preceding 24-hour counts; confidence is low until sufficient history is available.", "Forecasts are not actual measurements."],
    },
    system: { database: database.rows[0]?.ok ? "reachable" : "unknown", collectedAt: iso(new Date()) },
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(obj[key])).join(",") + "}";
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/\b(?:sk|pk|rk|api)[-_](?:live|test|prod)?[-_][A-Za-z0-9_-]{12,}\b/gi, "[credential redacted]")
    .replace(/\b(?:password|secret|token|api[_ -]?key)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b\d{12,}\b/g, "[long number redacted]");
}

function buildAnalysisPrompt(metrics: Metrics): string {
  return [
    "You are ReDom's evidence-bound operations analyst. Analyze only the JSON facts supplied. Do not invent counts, incidents, fixes, provider limits, causes, or successful deployments.",
    "Return valid JSON with keys: status (healthy|degraded|critical|unknown), executiveSummary (string), keyChanges (array of strings), findings (array of objects with severity, title, evidence, impact, confidence, recommendation), resolvedIssues (array of strings), pendingRisks (array of strings), nextActions (array of objects with priority, action, rationale, verification), forecastCommentary (string), limitations (array of strings).",
    "Separate confirmed facts from hypotheses. If logs are not available, say root-cause analysis is limited. Mark missing or partial email ledger coverage prominently. Do not call a metric zero when telemetry is missing.",
    JSON.stringify({ ...metrics, support: { ...metrics.support, repeatContactSendersPreviousMonth: metrics.support.repeatContactSendersPreviousMonth.map((x) => ({ email: "[redacted]", messages: x.messages, cases: x.cases })) }, fraud: { ...metrics.fraud, reviewedSignals: metrics.fraud.reviewedSignals.map((x) => ({ ...x, email: "[redacted]" })) } }),
  ].join("\n\n");
}

async function analyzeWithGemini(metrics: Metrics): Promise<Record<string, any>> {
  const models = [...new Set([GEMINI_MODEL, "gemini-3.8-flash", "gemini-3.5-flash-lite"])];
  const failures: string[] = [];
  for (const model of models) {
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.gemini.apiKey },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: buildAnalysisPrompt(metrics) }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      failures.push(`${model}: ${error instanceof Error ? error.message : "network/timeout failure"}`);
      continue;
    }
    if (response.status === 404) {
      failures.push(`${model}: HTTP 404 model unavailable`);
      continue;
    }
    if (!response.ok) throw new Error(`Gemini analysis failed with HTTP ${response.status} for configured/fallback model.`);
    const payload = await response.json() as any;
    const responseText = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("").trim();
    if (!responseText) throw new Error("Gemini returned no structured analysis.");
    const parsed = JSON.parse(responseText);
    if (!["healthy", "degraded", "critical", "unknown"].includes(parsed.status) || typeof parsed.executiveSummary !== "string" || !Array.isArray(parsed.findings) || !Array.isArray(parsed.nextActions)) {
      throw new Error("Gemini analysis failed schema validation.");
    }
    return parsed;
  }
  throw new Error(`Gemini analysis unavailable after fallback attempts: ${failures.join("; ")}`);
}

function pdfEscape(text: string): string {
  return text.normalize("NFKD").replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
function makePdf(pages: string[][]): Buffer {
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", ""];
  const streams: string[] = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const lines = pages[pageIndex] ?? [];
    const parts = [
      "q 0.09 0.47 0.95 rg 0 766 612 76 re f Q",
      "BT /F2 17 Tf 1 1 1 rg 48 808 Td (ReDom) Tj ET",
      "BT /F1 9 Tf 1 1 1 rg 48 788 Td (DAILY OPERATIONS INTELLIGENCE  |  CONFIDENTIAL) Tj ET",
      "q 0.94 0.95 0.97 rg 0 0 612 34 re f Q",
      "BT /F1 8 Tf 0.40 0.42 0.45 rg 48 14 Td (ReDom Platforms  |  Operational metrics and evidence) Tj ET",
      "BT /F1 8 Tf 0.40 0.42 0.45 rg 530 14 Td (" + (pageIndex + 1) + " / " + pages.length + ") Tj ET",
    ];
    let y = 744;
    for (const rawLine of lines) {
      const line = String(rawLine ?? "").slice(0, 150);
      if (line === "ReDom | DAILY OPERATIONS INTELLIGENCE") continue;
      if (!line) { y -= 5; continue; }
      const heading = line.length <= 42 && line === line.toUpperCase() && /[A-Z]/.test(line);
      if (heading) {
        y -= 3;
        parts.push("BT /F2 10 Tf 0.09 0.47 0.95 rg 48 " + y + " Td (" + pdfEscape(line) + ") Tj ET");
        y -= 16;
      } else {
        parts.push("BT /F1 8 Tf 0.12 0.13 0.15 rg 48 " + y + " Td (" + pdfEscape(line) + ") Tj ET");
        y -= 12;
      }
      if (y < 48) break;
    }
    if (pageIndex === pages.length - 1 && lines.some((line) => String(line).includes("OFFICIAL REDOM OPERATIONS REPORT"))) {
      const signed = lines.some((line) => String(line).includes("DIGITALLY SIGNED"));
      const reportId = String(lines.find((line) => String(line).startsWith("Report ID:")) ?? "Report ID: unavailable");
      const signatureAt = lines.findIndex((line) => String(line).startsWith("Unique report signature:"));
      const signatureText = signatureAt >= 0 ? String(lines[signatureAt + 1] ?? "unavailable") : "unavailable";
      const statusLine = String(lines.find((line) => String(line).startsWith("Platform status marker:")) ?? "");
      const platformStatus = statusLine.includes("CRITICAL") ? "CRITICAL" : statusLine.includes("DEGRADED") ? "DEGRADED" : statusLine.includes("HEALTHY") ? "HEALTHY" : "UNKNOWN";
      const stampColor = !signed || platformStatus === "CRITICAL" ? "0.70 0.12 0.12" : platformStatus === "DEGRADED" ? "0.68 0.39 0.00" : platformStatus === "HEALTHY" ? "0.03 0.40 0.25" : "0.32 0.35 0.40";
      parts.push("q " + stampColor + " RG 2 w 350 440 212 112 re S 358 448 196 96 re S Q");
      parts.push("BT /F2 9 Tf " + stampColor + " rg 364 532 Td (REDOM OFFICIAL SYSTEM STAMP) Tj ET");
      parts.push("BT /F2 10 Tf " + stampColor + " rg 364 513 Td (" + (signed ? "DIGITALLY SIGNED / VERIFY ONLINE" : "UNSIGNED / DO NOT TRUST AS AUTHENTIC") + ") Tj ET");
      parts.push("BT /F2 9 Tf " + stampColor + " rg 364 500 Td (PLATFORM STATUS: " + platformStatus + ") Tj ET");
      parts.push("BT /F1 8 Tf 0.12 0.13 0.15 rg 364 494 Td (" + pdfEscape(reportId).slice(0, 100) + ") Tj ET");
      parts.push("BT /F1 8 Tf 0.12 0.13 0.15 rg 364 478 Td (Signature fingerprint: " + pdfEscape(signatureText).slice(0, 28) + ") Tj ET");
      parts.push("BT /F1 7 Tf 0.12 0.13 0.15 rg 364 461 Td (Verify at /ops/reports/<report-id>/verify) Tj ET");
    }
    streams.push(parts.join("\n"));
  }
  const contentIds: number[] = [];
  for (const stream of streams) {
    contentIds.push(objects.length + 1);
    objects.push("<< /Length " + Buffer.byteLength(stream, "ascii") + " >>\nstream\n" + stream + "\nendstream");
  }
  const pageStartId = objects.length + 1;
  const pageIds = pages.map((_, index) => pageStartId + index);
  const regularFontId = pageStartId + pages.length;
  const boldFontId = regularFontId + 1;
  for (let index = 0; index < pages.length; index++) {
    objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 " + regularFontId + " 0 R /F2 " + boldFontId + " 0 R >> >> /Contents " + contentIds[index] + " 0 R >>");
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  objects[1] = "<< /Type /Pages /Kids [" + pageIds.map(id => id + " 0 R").join(" ") + "] /Count " + pageIds.length + " >>";
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => { offsets.push(Buffer.byteLength(pdf, "ascii")); pdf += (index + 1) + " 0 obj\n" + obj + "\nendobj\n"; });
  const xref = Buffer.byteLength(pdf, "ascii");
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return Buffer.from(pdf, "ascii");
}

function reportPages(m: Metrics, a: Record<string, any>, stamp: { reportKey: string; generatedAt: string; payloadHash: string; signature: string | null; keyId: string | null }): string[][] {
  const currentMonth = m.periodEnd.slice(0, 7);
  const rollingWindowFirstMonth = m.email.rolling365Start.slice(0, 7);
  const completeMonths = m.email.monthlyTrend.filter((row) => row.month < currentMonth && row.month > rollingWindowFirstMonth);
  const latestComplete = completeMonths[completeMonths.length - 1];
  const previousComplete = completeMonths[completeMonths.length - 2];
  const improvementSummary = latestComplete && previousComplete && latestComplete.deliveryRatePct !== null && previousComplete.deliveryRatePct !== null && latestComplete.outcomeCoveragePct !== null && previousComplete.outcomeCoveragePct !== null && latestComplete.outcomeCoveragePct >= 80 && previousComplete.outcomeCoveragePct >= 80
    ? "Delivery rate " + (latestComplete.deliveryRatePct > previousComplete.deliveryRatePct ? "IMPROVED by " : latestComplete.deliveryRatePct < previousComplete.deliveryRatePct ? "DECLINED by " : "UNCHANGED at ") + Math.abs(latestComplete.deliveryRatePct - previousComplete.deliveryRatePct) + " percentage points (" + previousComplete.month + " " + previousComplete.deliveryRatePct + "% -> " + latestComplete.month + " " + latestComplete.deliveryRatePct + "%)."
    : "No defensible month-over-month delivery improvement conclusion: monthly outcome coverage is missing or incomplete.";
  const lines = [
    "ReDom | DAILY OPERATIONS INTELLIGENCE",
    "Reporting period: " + m.periodStart + " to " + m.periodEnd + " (" + m.timezone + ")",
    "Overall status: " + String(a.status ?? "unknown").toUpperCase(),
    "",
    "EXECUTIVE SUMMARY",
    ...wrap(String(a.executiveSummary ?? "AI analysis unavailable; factual metrics follow."), 88),
    "",
    "EMAIL OPERATIONS — LAST 24 HOURS",
    "Unique emails: " + emailMetric(m.email.current24h.uniqueEmails, m) + " | Send attempts/retries: " + emailMetric(m.email.current24h.attempts, m) + " | Accepted: " + emailMetric(m.email.current24h.accepted, m) + " | Delivered events: " + emailMetric(m.email.current24h.delivered, m),
    "24-hour delivery rate (delivered / known terminal outcomes): " + formatPct(rate(m.email.current24h.delivered, m.email.current24h.delivered + m.email.current24h.failed + m.email.current24h.bounced + m.email.current24h.rejected)),
    "Failed: " + emailMetric(m.email.current24h.failed, m) + " | Bounced: " + emailMetric(m.email.current24h.bounced, m) + " | Rejected: " + emailMetric(m.email.current24h.rejected, m),
    "Deferred: " + emailMetric(m.email.current24h.deferred, m) + " | Duplicate sends suppressed: " + emailMetric(m.email.current24h.duplicateSuppressed, m) + " | Duplicate deliveries: " + emailMetric(m.email.current24h.duplicateDelivery, m),
    "Previous 24h attempts: " + emailMetric(m.email.previous24h.attempts, m) + " | Change: " + formatPct(m.email.changePct.attempts),
    "",
    "PAST-MONTH IMPROVEMENT SCORECARD",
    improvementSummary,
    latestComplete && previousComplete ? "Unique emails: " + previousComplete.attempts + " -> " + latestComplete.attempts + "; delivered: " + previousComplete.delivered + " -> " + latestComplete.delivered + "; failed: " + previousComplete.failed + " -> " + latestComplete.failed + "." : "Historical baseline unavailable; do not claim improvement or regression.",
    "Annual incident register: " + m.incidents.created365d + " recorded, " + m.incidents.resolved365d + " resolved/closed in rolling 365 days; " + m.incidents.criticalCreated365d + " critical incidents created, " + m.incidents.criticalResolved365d + " critical resolved/closed, " + m.incidents.criticalOpen + " critical currently open.",
    "",
    "EMAIL OPERATIONS — ROLLING 365 DAYS",
    "Rolling window: " + m.email.rolling365Start + " through " + m.email.rolling365End,
    "Unique emails attempted: " + emailMetric(m.email.last365d.uniqueEmails, m) + " | Send attempts/retries: " + emailMetric(m.email.last365d.sendAttempts, m) + " | Provider-accepted messages: " + emailMetric(m.email.last365d.accepted, m) + " | Delivered: " + emailMetric(m.email.last365d.delivered, m) + " | Failed: " + emailMetric(m.email.last365d.failed, m),
    "Bounced: " + emailMetric(m.email.last365d.bounced, m) + " | Duplicate suppression: " + emailMetric(m.email.last365d.duplicateSuppressed, m),
    "Email ledger coverage: " + (m.email.ledgerCoverageStart ?? "No events recorded"),
    "",
    "MONTH-BY-MONTH EMAIL DELIVERY — EXACT ROLLING 365-DAY WINDOW",
    "Window: " + m.email.rolling365Start + " through " + m.email.rolling365End + ". First/current month buckets may be partial; pre-window events are excluded.",
    "Delivery rate = delivered / (delivered + failed + bounced + rejected); unknown outcomes are excluded. Outcome coverage is shown separately.",
    ...m.email.monthlyTrend.map((row) => row.month + ": unique emails " + row.attempts + ", send attempts/retries " + row.sendAttempts + ", delivered " + row.delivered + ", failed " + row.failed + ", bounced " + row.bounced + ", rejected " + row.rejected + ", delivery rate " + (row.deliveryRatePct === null ? "N/A" : row.deliveryRatePct + "%") + ", outcome coverage " + (row.outcomeCoveragePct === null ? "N/A" : row.outcomeCoveragePct + "%")),
    "",
    "LIMITS AND CAPACITY",
    "Configured daily limit: " + (m.email.dailyLimit ?? "Unknown") + " | Usage: " + (m.email.dailyLimitUsedPct === null ? "Unknown" : m.email.dailyLimitUsedPct + "%"),
    "Configured monthly limit: " + (m.email.monthlyLimit ?? "Unknown") + " | Month-to-date attempts: " + emailMetric(m.email.monthlySent, m) + " | Usage: " + (m.email.monthlyLimitUsedPct === null ? "Unknown" : m.email.monthlyLimitUsedPct + "%"),
    "",
    "SUPPORT OPERATIONS",
    "Cases created: " + moneyless(m.support.created24h) + " | Previous 24h: " + moneyless(m.support.createdPrevious24h) + " | Change: " + formatPct(m.support.changePct),
    "Created in rolling 365 days: " + moneyless(m.support.created365d) + " | Closed in rolling 365 days: " + moneyless(m.support.closed365d),
    ...wrap("Case numbers created in this report window: " + (m.support.createdCaseNumbers24h.join(", ") || "None recorded"), 88),
    ...wrap("Active case numbers (first 100): " + (m.support.activeCaseNumbers.join(", ") || "None"), 88),
    ...wrap("Invalidated/marked-invalid case numbers (first 100; recycling not independently tracked): " + (m.support.invalidCaseNumbers.join(", ") || "None"), 88),
    "Resolved case numbers in rolling 365 days (first 100): " + (m.support.resolvedCaseNumbers365d.join(", ") || "None recorded"),
    "Failed inbound support email processing in last 24h: " + m.support.failedSupportInbound24h + "; refund outcomes marked failed in rolling 365 days: " + m.support.failedRefundOutcomes365d + ". These are failed processing/refund outcomes, not a fabricated support-case status.",
    "Invalidated/marked-invalid cases: " + moneyless(m.support.invalidated) + ". Expiration/recycling have no distinct source fields, and the case status schema has no failed state; neither is inferred from invalidation or email failures.",
    "Most repeated contacts in the previous full calendar month (repeat contact is not proof of abuse):",
    ...m.support.repeatContactSendersPreviousMonth.slice(0,10).map((r) => r.email + ": " + r.messages + " user messages across " + r.cases + " cases"),
    "Open high-priority review candidates (heuristic only; the support schema has no official severity field): " + m.support.priorityReviewCases.length,
    ...m.support.priorityReviewCases.slice(0,20).flatMap((r) => wrap(r.caseNumber + " [" + r.status + "; " + r.category + "] " + r.subject + " — " + r.indicators.join("; "), 88)),
    "Support case trend — last 12 calendar months (created / closed):",
    ...m.support.monthlyTrend.map((r) => r.month + ": " + r.created + " created / " + r.closed + " closed"),
    "Top support categories, past 30 days:",
    ...m.support.topTopics30d.slice(0,8).map((r) => r.topic + ": " + r.count),
    "Most common submitted subjects/questions, past 30 days:",
    ...m.support.topQuestions30d.slice(0,10).map((r) => r.count + "× " + r.question),
    "Top registration countries, last 365 days (aggregate; location may be IP-derived):",
    ...m.geography.topCountries.map((g) => g.country + ": " + g.signups + " registrations/reservations"),
    "Top registration cities, last 365 days (aggregate; not current physical location):",
    ...m.geography.topCities.map((g) => g.city + ", " + g.country + ": " + g.signups),
    "Heuristic suspicious-support signals: current 30d " + m.fraud.signalCount30d + " distinct senders / " + m.fraud.flaggedMessages30d + " matching messages; previous 30d " + m.fraud.previousSignalCount30d + " senders / " + m.fraud.previousFlaggedMessages30d + " messages. Sender change " + formatPct(m.fraud.changePct30d) + "; message change " + formatPct(m.fraud.flaggedMessagesChangePct30d) + "; higher-review-priority signals " + m.fraud.highReviewPriorityCount + "; manual-review signals " + m.fraud.manualReviewCount + "; trend " + m.fraud.trend30d + ". " + m.fraud.warning,
    ...m.fraud.reviewedSignals.slice(0,12).flatMap((r) => wrap(r.email + " | score " + r.score + "/100 (" + r.risk + ") | " + r.indicators.join("; ") + " | cases " + r.caseNumbers.join(", ") + " | recommended next step: " + r.recommendedAction, 88)),
    "Critical tracked incident IDs: " + (m.incidents.open.filter((i: any) => i.severity === "critical").map((i: any) => String(i.incident_key ?? i.id)).join(", ") || "None currently open") + ". The support-case schema has no independent severity field; critical counts refer to the incident register, not guessed case priority.",
    "Open: " + moneyless(m.support.open) + " | Awaiting support: " + moneyless(m.support.awaitingSupport) + " | Awaiting user: " + moneyless(m.support.awaitingUser) + " | Closed: " + moneyless(m.support.closed),
    "Support messages: " + moneyless(m.support.messages24h) + " (not equal to outbound emails).",
    "Email events linked to cases created in this window: " + moneyless(m.support.emailsConsumedByNewCases24h) + " (attempts: " + moneyless(m.support.caseLinkedEmailAttempts24h) + ").",
    ...m.support.caseEmailBreakdown.slice(0, 12).map((c) => "Case " + c.caseNumber + ": " + c.attempts + " attempts, " + c.accepted + " accepted, " + c.delivered + " delivered, " + c.failed + " failed."),
    "",
    "24-HOUR COMPARISON CHART",
    "Email attempts  previous " + moneyless(m.email.previous24h.attempts) + " | current " + moneyless(m.email.current24h.attempts),
    "Previous  " + "#".repeat(Math.min(40, Math.round(m.email.previous24h.attempts / Math.max(1, m.email.previous24h.attempts, m.email.current24h.attempts) * 40))) + " 100% scale",
    "Current   " + "#".repeat(Math.min(40, Math.round(m.email.current24h.attempts / Math.max(1, m.email.previous24h.attempts, m.email.current24h.attempts) * 40))) + " change " + formatPct(m.email.changePct.attempts),
    "Support cases previous " + moneyless(m.support.createdPrevious24h) + " | current " + moneyless(m.support.created24h),
    "Previous  " + "#".repeat(Math.min(40, Math.round(m.support.createdPrevious24h / Math.max(1, m.support.createdPrevious24h, m.support.created24h) * 40))),
    "Current   " + "#".repeat(Math.min(40, Math.round(m.support.created24h / Math.max(1, m.support.createdPrevious24h, m.support.created24h) * 40))) + " change " + formatPct(m.support.changePct),
    "",
    "RESOLVED ISSUES",
    ...arrayStrings(a.resolvedIssues).slice(0, 8).flatMap((s) => wrap("• " + s, 88)),
    "",
    "ENGINEERING NEXT ACTIONS",
    ...arrayStrings(a.nextActions).slice(0, 8).flatMap((s) => wrap("• " + s, 88)),
    "",
    "INCIDENTS AND RISKS",
    "Open tracked incidents: " + m.incidents.open.length + " | Critical open: " + m.incidents.criticalOpen,
    "Critical incident identifiers: " + (m.incidents.open.filter((i: any) => i.severity === "critical").map((i: any) => String(i.incident_key ?? i.id)).join(", ") || "None currently open"),
    ...m.incidents.open.slice(0, 8).flatMap((i: any) => wrap("[" + String(i.severity).toUpperCase() + "] " + String(i.title) + " — " + String(i.status) + ". " + String(i.description), 88)),
    "",
    "GEMINI FINDINGS",
    ...arrayStrings(a.findings).slice(0, 8).flatMap((s) => wrap("• " + s, 88)),
    "",
    "PENDING RISKS",
    ...arrayStrings(a.pendingRisks).slice(0, 8).flatMap((s) => wrap("• " + s, 88)),
    "",
    "NEXT 24 HOURS — FORECAST",
    "Expected email attempts: " + moneyless(m.forecast.expectedEmailAttempts24h) + " (low-confidence weighted estimate)",
    "Expected support cases: " + moneyless(m.forecast.expectedSupportCases24h) + " (low-confidence weighted estimate)",
    ...m.forecast.notes.flatMap((s) => wrap("• " + s, 88)),
    "",
    "DATA COVERAGE AND LIMITATIONS",
    ...Object.entries(m.dataCoverage).flatMap(([k, v]) => wrap(k + ": " + v, 88)),
    "",
    "Generated at " + m.generatedAt + ". Metrics are evidence-based; unavailable telemetry is not treated as healthy.",
  ];
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += 32) chunks.push(lines.slice(i, i + 32));
  chunks.push([
    "OFFICIAL REDOM OPERATIONS REPORT",
    "AUTOMATED ADMINISTRATIVE RECORD — CONFIDENTIAL",
    stamp.signature ? "DIGITALLY SIGNED — HMAC-SHA256" : "UNSIGNED — REPORT SIGNING KEY NOT CONFIGURED",
    "Report ID: " + stamp.reportKey,
    "Generated at: " + stamp.generatedAt,
    "Signed payload SHA-256: " + stamp.payloadHash,
    "Signature key ID: " + (stamp.keyId ?? "NOT CONFIGURED"),
    "Unique report signature:",
    ...wrap(stamp.signature ?? "NO SIGNATURE — configure REDOM_OPS_REPORT_SIGNING_KEY before treating reports as authenticated.", 78),
    "Verification endpoint: /ops/reports/" + stamp.reportKey + "/verify",
    "This is a cryptographic system stamp, not a handwritten officer signature.",
    "Platform status marker: " + String(a.status ?? "unknown").toUpperCase() + ". The signature authenticates report integrity, not telemetry completeness.",
    "Fraud signals are unverified review leads and do not authorize automatic enforcement.",
  ]);
  return chunks.length ? chunks : [["ReDom Daily Operations Intelligence"]];
}
function wrap(value: string, width: number): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const out: string[] = []; let line = "";
  for (const word of words) { if (line && line.length + word.length + 1 > width) { out.push(line); line = word; } else line += (line ? " " : "") + word; }
  if (line) out.push(line);
  return out;
}
function arrayStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x: any) => typeof x === "string" ? x : [
    x?.severity, x?.priority, x?.title, x?.action, x?.evidence, x?.impact,
    x?.recommendation, x?.rationale, x?.verification,
  ].filter(Boolean).join(" — ")).filter(Boolean);
}
function rate(delivered: number, terminalOutcomes: number): number | null { return terminalOutcomes > 0 ? Math.round((delivered / terminalOutcomes) * 10000) / 100 : null; }

function formatPct(value: number | null): string { return value === null ? "N/A (previous period was zero or unavailable)" : (value > 0 ? "+" : "") + value + "%"; }

function htmlReport(m: Metrics, a: Record<string, any>, pdfHash: string, stamp: { reportKey: string; generatedAt: string; payloadHash: string; signature: string | null; keyId: string | null }): string {
  const currentMonth = m.periodEnd.slice(0, 7);
  const rollingWindowFirstMonth = m.email.rolling365Start.slice(0, 7);
  const completeMonths = m.email.monthlyTrend.filter((row) => row.month < currentMonth && row.month > rollingWindowFirstMonth);
  const latestComplete = completeMonths[completeMonths.length - 1];
  const previousComplete = completeMonths[completeMonths.length - 2];
  const improvementSummary = latestComplete && previousComplete && latestComplete.deliveryRatePct !== null && previousComplete.deliveryRatePct !== null && latestComplete.outcomeCoveragePct !== null && previousComplete.outcomeCoveragePct !== null && latestComplete.outcomeCoveragePct >= 80 && previousComplete.outcomeCoveragePct >= 80
    ? "Delivery rate " + (latestComplete.deliveryRatePct > previousComplete.deliveryRatePct ? "IMPROVED by " : latestComplete.deliveryRatePct < previousComplete.deliveryRatePct ? "DECLINED by " : "UNCHANGED at ") + Math.abs(latestComplete.deliveryRatePct - previousComplete.deliveryRatePct) + " percentage points (" + previousComplete.month + " " + previousComplete.deliveryRatePct + "% -> " + latestComplete.month + " " + latestComplete.deliveryRatePct + "%)."
    : "No defensible month-over-month delivery improvement conclusion: monthly outcome coverage is missing or incomplete.";
  const status = ["healthy", "degraded", "critical"].includes(a.status) ? a.status : "unknown";
  const card = (label: string, value: string, note = "") => `<td style="padding:10px"><div style="background:#fff;border:1px solid #DADDE1;border-radius:10px;padding:15px"><div style="color:#65676B;font-size:12px">${esc(label)}</div><div style="font-size:24px;font-weight:700;color:#1C1E21;margin-top:7px">${esc(value)}</div><div style="color:#65676B;font-size:11px;margin-top:5px">${esc(note)}</div></div></td>`;
  const findings = arrayStrings(a.findings).slice(0, 8).map(x => `<li style="margin:8px 0">${esc(x)}</li>`).join("");
  const risks = arrayStrings(a.pendingRisks).slice(0, 8).map(x => `<li style="margin:8px 0">${esc(x)}</li>`).join("");
  const trend = (label: string, current: number, previous: number, change: number | null) => {
    const scale = Math.max(1, current, previous);
    const currentWidth = Math.max(0, Math.min(100, Math.round(current / scale * 100)));
    const previousWidth = Math.max(0, Math.min(100, Math.round(previous / scale * 100)));
    return `<tr><td colspan="2" style="padding:8px 0"><div style="font-size:13px;font-weight:700;margin-bottom:7px">${esc(label)} · change ${esc(formatPct(change))}</div><div style="font-size:11px;color:#65676B">Previous 24h: ${moneyless(previous)}</div><div style="height:8px;background:#F0F2F5;border-radius:6px;overflow:hidden"><div style="height:8px;width:${previousWidth}%;background:#9CBDF8"></div></div><div style="font-size:11px;color:#65676B;margin-top:7px">Current 24h: ${moneyless(current)}</div><div style="height:8px;background:#F0F2F5;border-radius:6px;overflow:hidden"><div style="height:8px;width:${currentWidth}%;background:#1877F2"></div></div></td></tr>`;
  };
  return `<!doctype html><html><body style="margin:0;background:#F0F2F5;color:#1C1E21;font-family:Arial,Helvetica,sans-serif"><div style="max-width:760px;margin:0 auto;padding:24px 12px"><div style="background:#1877F2;color:white;padding:26px;border-radius:14px 14px 0 0"><div style="font-size:12px;letter-spacing:2px">REDOM OPERATIONS INTELLIGENCE</div><h1 style="margin:12px 0 5px;font-size:26px">Daily Executive Report</h1><div style="font-size:13px">${esc(m.periodStart)} — ${esc(m.periodEnd)} (${esc(m.timezone)})</div></div><div style="background:white;padding:22px;border:1px solid #DADDE1"><div style="display:inline-block;background:${status==="critical"?"#FCE8E6":status==="degraded"?"#FFF4CE":status==="healthy"?"#E1F5E8":"#F0F2F5"};padding:8px 12px;border-radius:18px;font-weight:bold">Platform status: ${esc(status.toUpperCase())}</div><h2 style="font-size:18px;margin-top:20px">Executive summary</h2><p style="line-height:1.65">${esc(a.executiveSummary ?? "AI analysis unavailable; see verified metrics below.")}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${card("Email attempts (24h)",emailMetric(m.email.current24h.attempts,m),"Change "+formatPct(m.email.changePct.attempts))}${card("Delivered events (24h)",emailMetric(m.email.current24h.delivered,m),"Provider events recorded")}</tr><tr>${card("Support cases (24h)",moneyless(m.support.created24h),"Change "+formatPct(m.support.changePct))}${card("Open critical incidents",String(m.incidents.criticalOpen),"Tracked incidents only")}</tr></table><h2 style="font-size:18px">Email usage</h2><p>Rolling 365-day window: <b>${esc(m.email.rolling365Start)} — ${esc(m.email.rolling365End)}</b>. Unique emails attempted: <b>${emailMetric(m.email.last365d.uniqueEmails,m)}</b>; provider-accepted messages: <b>${emailMetric(m.email.last365d.accepted,m)}</b>; send attempts/retries: <b>${emailMetric(m.email.last365d.sendAttempts,m)}</b>. Failures: <b>${emailMetric(m.email.current24h.failed,m)}</b>. Duplicate sends suppressed: <b>${emailMetric(m.email.current24h.duplicateSuppressed,m)}</b>. Duplicate delivery events: <b>${emailMetric(m.email.current24h.duplicateDelivery,m)}</b>.</p><p>Daily quota: <b>${m.email.dailyLimit ?? "Unknown"}</b>; usage: <b>${m.email.dailyLimitUsedPct===null?"Unknown":m.email.dailyLimitUsedPct+"%"}</b>. Monthly quota: <b>${m.email.monthlyLimit ?? "Unknown"}</b>; month-to-date attempts: <b>${moneyless(m.email.monthlySent)}</b>.</p><h2 style="font-size:18px">24-hour trends</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${trend("Email attempts",m.email.current24h.attempts,m.email.previous24h.attempts,m.email.changePct.attempts)}${trend("Support cases",m.support.created24h,m.support.createdPrevious24h,m.support.changePct)}</table><h2 style="font-size:18px">Support workload</h2><p>Open: ${moneyless(m.support.open)} · Awaiting ReDom: ${moneyless(m.support.awaitingSupport)} · Awaiting customer: ${moneyless(m.support.awaitingUser)} · Support messages (24h): ${moneyless(m.support.messages24h)}. Email events attributed to newly created cases: ${moneyless(m.support.emailsConsumedByNewCases24h)} (attempts: ${moneyless(m.support.caseLinkedEmailAttempts24h)}). Message count is not equivalent to email delivery count.</p><h3 style="font-size:15px">Email use by new support case</h3><ul>${m.support.caseEmailBreakdown.slice(0,12).map(c=>`<li>Case ${esc(c.caseNumber)}: ${c.attempts} attempts, ${c.accepted} accepted, ${c.delivered} delivered, ${c.failed} failed</li>`).join("") || "<li>No case-linked email events recorded.</li>"}</ul><h2 style="font-size:18px">AI findings</h2><ul>${findings || "<li>No validated findings were returned.</li>"}</ul><h2 style="font-size:18px">Pending risks</h2><ul>${risks || "<li>No pending risks reported by analysis; see data coverage limitations.</li>"}</ul><h2 style="font-size:18px">Next 24 hours</h2><p>Expected email attempts: <b>${moneyless(m.forecast.expectedEmailAttempts24h)}</b>; expected support cases: <b>${moneyless(m.forecast.expectedSupportCases24h)}</b>. These are low-confidence weighted estimates until longer history is available.</p><h2 style="font-size:18px">Data quality</h2><ul>${Object.entries(m.dataCoverage).map(([k,v])=>`<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join("")}</ul><h2 style="font-size:18px">Past-month improvement scorecard</h2><p>${esc(improvementSummary)} ${latestComplete&&previousComplete?esc("Unique emails "+previousComplete.attempts+" → "+latestComplete.attempts+"; delivered "+previousComplete.delivered+" → "+latestComplete.delivered+"; failed "+previousComplete.failed+" → "+latestComplete.failed+"."):"Historical baseline unavailable; improvement is not asserted."}</p><p>Tracked incidents created in rolling 365 days: ${m.incidents.created365d}; resolved/closed: ${m.incidents.resolved365d}; critical created: ${m.incidents.criticalCreated365d}; critical resolved: ${m.incidents.criticalResolved365d}; critical open: ${m.incidents.criticalOpen}.</p><h2 style="font-size:18px">Major registration locations (aggregate)</h2><p>${esc(m.geography.source)}</p><div class="grid"><div><b>Countries</b><ul>${m.geography.topCountries.map(g=>`<li>${esc(g.country)}: ${g.signups}</li>`).join("")||"<li>No location data recorded.</li>"}</ul></div><div><b>Cities</b><ul>${m.geography.topCities.map(g=>`<li>${esc(g.city+", "+g.country)}: ${g.signups}</li>`).join("")||"<li>No city data recorded.</li>"}</ul></div></div><h2 style="font-size:18px">Monthly delivery trend (exact rolling 365-day window; partial edge months)</h2><table width="100%" cellspacing="0" cellpadding="7" style="border-collapse:collapse;font-size:12px"><tr style="background:#F0F2F5"><th align="left">Month</th><th>Unique emails</th><th>Send attempts</th><th>Delivered</th><th>Delivery rate</th><th>Outcome coverage</th></tr>${m.email.monthlyTrend.map(r=>`<tr><td>${esc(r.month)}</td><td align="right">${r.attempts}</td><td align="right">${r.sendAttempts}</td><td align="right">${r.delivered}</td><td align="right">${r.deliveryRatePct===null?"N/A":r.deliveryRatePct+"%"}</td><td align="right">${r.outcomeCoveragePct===null?"N/A":r.outcomeCoveragePct+"%"}</td></tr>`).join("")}</table><h2 style="font-size:18px">Support case trend (last 12 calendar months)</h2><table width="100%" cellspacing="0" cellpadding="7" style="border-collapse:collapse;font-size:12px"><tr style="background:#F0F2F5"><th align="left">Month</th><th>Created</th><th>Closed</th></tr>${m.support.monthlyTrend.map(r=>`<tr><td>${esc(r.month)}</td><td align="right">${r.created}</td><td align="right">${r.closed}</td></tr>`).join("")}</table><h2 style="font-size:18px">Support lifecycle and repeated contacts</h2><p>Case numbers created in the last 24 hours: ${esc(m.support.createdCaseNumbers24h.join(", ")||"None")}</p><p>Active case numbers (first 100): ${esc(m.support.activeCaseNumbers.join(", ")||"None")}</p><p>Invalidated/marked-invalid case numbers (first 100): ${esc(m.support.invalidCaseNumbers.join(", ")||"None")}</p><p>Top categories: ${esc(m.support.topTopics30d.map(x=>x.topic+" ("+x.count+")").join("; ")||"None recorded")}</p><p>Common questions: ${esc(m.support.topQuestions30d.slice(0,8).map(x=>x.question+" ("+x.count+")").join("; ")||"None recorded")}</p><p>Created (365d): ${m.support.created365d}; closed (365d): ${m.support.closed365d}; active now: ${m.support.open}; invalidated/marked-invalid: ${m.support.invalidated}. Expiration/recycling are not independently tracked in the current case schema, so invalidation must not be represented as either.</p><ul>${m.support.repeatContactSendersPreviousMonth.slice(0,10).map(r=>`<li>${esc(r.email)} — ${r.messages} user messages across ${r.cases} cases in the previous full calendar month</li>`).join("")||"<li>No repeated-contact patterns at the configured threshold in the previous full calendar month.</li>"}</ul><h3>High-priority case review candidates (heuristic, not an official case severity)</h3><p>${m.support.priorityReviewCases.length} open cases matched security/payment/service-continuity review signals. These are review candidates only; no automatic enforcement is performed.</p><ul>${m.support.priorityReviewCases.slice(0,20).map(r=>`<li>${esc(r.caseNumber)} [${esc(r.status)} · ${esc(r.category)}] ${esc(r.subject)} — ${esc(r.indicators.join("; "))}</li>`).join("")||"<li>No open cases matched the current review rules.</li>"}</ul><h2 style="font-size:18px">Potential risk signals — manual review only</h2><p>${esc(m.fraud.warning)} Distinct senders flagged: ${m.fraud.signalCount30d}; previous 30 days: ${m.fraud.previousSignalCount30d}; trend: ${esc(m.fraud.trend30d)} (${esc(formatPct(m.fraud.changePct30d))}). Matching messages: ${m.fraud.flaggedMessages30d} vs ${m.fraud.previousFlaggedMessages30d} (change ${esc(formatPct(m.fraud.flaggedMessagesChangePct30d))}); higher-review-priority signals: ${m.fraud.highReviewPriorityCount}; manual-review signals: ${m.fraud.manualReviewCount}.</p><ul>${m.fraud.reviewedSignals.slice(0,12).map(r=>`<li>${esc(r.email)} — score ${r.score}/100; ${esc(r.risk)}; ${esc(r.indicators.join("; "))}; cases ${esc(r.caseNumbers.join(", "))}; recommended action: ${esc(r.recommendedAction)}</li>`).join("")||"<li>No heuristic signals detected in the sampled support-message window.</li>"}</ul><h2 style="font-size:18px">Official report stamp</h2><div style="border:2px solid ${stamp.signature?"#1877F2":"#B42318"};padding:14px;border-radius:8px"><b>${stamp.signature?"DIGITALLY SIGNED — HMAC-SHA256":"UNSIGNED — SIGNING KEY NOT CONFIGURED"}</b><p>Report ID: ${esc(stamp.reportKey)}<br>Payload SHA-256: ${esc(stamp.payloadHash)}<br>Key ID: ${esc(stamp.keyId??"NOT CONFIGURED")}<br>Signature: ${esc(stamp.signature??"No signature")}</p><p>Verify: /ops/reports/${esc(stamp.reportKey)}/verify</p></div><p style="font-size:11px;color:#65676B">PDF SHA-256: ${esc(pdfHash)}. This administrative report is confidential and intended only for the configured ReDom administrator.</p></div><div style="text-align:center;color:#65676B;font-size:11px;padding:18px">ReDom · Daily Operations Intelligence · Automated report</div></div></body></html>`;
}

async function generateReport(now: Date): Promise<void> {
  const dayKey = Math.floor(now.getTime() / 86400000);
  const reportKey = "daily-ops-" + dayKey + "-v3";
  const client = await pool.connect();
  let runId: string | null = null;
  try {
    await client.query("BEGIN");
    const lock = await client.query("SELECT pg_try_advisory_xact_lock(hashtext('redom-daily-ops-report')) AS locked");
    if (!lock.rows[0]?.locked) { await client.query("ROLLBACK"); return; }
    const existing = await client.query("SELECT id, status, updated_at FROM redom_ops_report_runs WHERE report_key=$1 FOR UPDATE", [reportKey]);
    if (existing.rows[0]?.status === "sent") { await client.query("ROLLBACK"); return; }
    if (existing.rows[0]) {
      const existingStatus = String(existing.rows[0].status);
      const lastTouched = new Date(String(existing.rows[0].updated_at)).getTime();
      // A recent running/generated run is already owned by another instance or is
      // awaiting its send step. Only reclaim a stale run after a process crash.
      if ((existingStatus === "running" || existingStatus === "generated") && Date.now() - lastTouched < 10 * 60 * 1000) {
        await client.query("ROLLBACK");
        return;
      }
      // Failed deliveries back off exponentially (1, 2, 4, 8, 16 minutes; capped
      // at 30) rather than repeatedly calling Gemini/Resend every scheduler tick.
      if (existingStatus === "failed") {
        const attempts = Number((await client.query("SELECT attempt_count FROM redom_ops_report_runs WHERE id=$1", [String(existing.rows[0].id)])).rows[0]?.attempt_count ?? 1);
        const backoffMs = Math.min(30, Math.pow(2, Math.max(0, attempts - 1))) * 60 * 1000;
        if (Date.now() - lastTouched < backoffMs) { await client.query("ROLLBACK"); return; }
      }
      runId = String(existing.rows[0].id);
      await client.query("UPDATE redom_ops_report_runs SET status='running', error_message=NULL, attempt_count=attempt_count+1, updated_at=now() WHERE id=$1", [runId]);
    } else {
      const start = new Date(now.getTime() - 86400000);
      const inserted = await client.query("INSERT INTO redom_ops_report_runs (report_key,period_start,period_end,timezone,status,attempt_count) VALUES ($1,$2,$3,$4,'running',1) RETURNING id", [reportKey,start,now,REPORT_TIMEZONE]);
      runId = String(inserted.rows[0].id);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally { client.release(); }
  if (!runId) return;

  try {
    if (!REPORT_SIGNING_KEY || REPORT_SIGNING_KEY.length < 32) {
      throw new Error("REDOM_OPS_REPORT_SIGNING_KEY must be configured with at least 32 characters; refusing to issue an unsigned executive report.");
    }
    const metrics = await collectMetrics(now);
    let analysis: Record<string, any>;
    try { analysis = await analyzeWithGemini(metrics); }
    catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, "Gemini daily operations analysis unavailable");
      analysis = { status: "unknown", executiveSummary: "Gemini analysis unavailable. The attached report contains collected metrics and data-coverage limitations; no AI conclusions are asserted.", keyChanges: [], findings: [], resolvedIssues: [], pendingRisks: ["AI analysis unavailable; inspect backend/provider health and retry the report."], nextActions: [{ priority: "high", action: "Restore or verify Gemini reporting integration", rationale: "Automated analysis did not complete", verification: "A subsequent report contains schema-valid Gemini analysis." }], forecastCommentary: "Forecasts are simple weighted estimates.", limitations: ["Gemini analysis failed; see service logs."] };
    }
    // Deterministic evidence-based guardrails override optimistic model wording.
    // These rules change only the executive report, never production business records.
    const terminalOutcomes24h = metrics.email.current24h.delivered + metrics.email.current24h.failed + metrics.email.current24h.bounced + metrics.email.current24h.rejected;
    const deliveryRate24h = terminalOutcomes24h > 0 ? metrics.email.current24h.delivered / terminalOutcomes24h : null;
    const recentEmailFailures = metrics.email.current24h.failed + metrics.email.current24h.bounced + metrics.email.current24h.rejected;
    const hardCritical = metrics.incidents.criticalOpen > 0 || recentEmailFailures >= 10;
    const objectivelyDegraded = metrics.incidents.open.some((incident: any) => incident.severity === "high") || recentEmailFailures >= 3 || (terminalOutcomes24h >= 5 && deliveryRate24h !== null && deliveryRate24h < 0.90);
    if (hardCritical) {
      analysis.status = "critical";
      analysis.pendingRisks = [...(Array.isArray(analysis.pendingRisks) ? analysis.pendingRisks : []), "Deterministic operations guardrail: an open critical incident or at least 10 recent email failures/bounces/rejections requires urgent review."];
    } else if (objectivelyDegraded && analysis.status !== "critical") {
      analysis.status = "degraded";
      analysis.pendingRisks = [...(Array.isArray(analysis.pendingRisks) ? analysis.pendingRisks : []), "Deterministic operations guardrail: tracked high-severity incidents, an email-failure burst, or delivery below 90% across at least five terminal outcomes requires review."];
    }
    const payloadHash = createHash("sha256").update(canonicalJson({ metrics, analysis })).digest("hex");
    const signedAt = iso(now);
    const signature = REPORT_SIGNING_KEY ? createHmac("sha256", REPORT_SIGNING_KEY).update(reportKey + "|" + signedAt + "|" + payloadHash).digest("hex") : null;
    const keyId = REPORT_SIGNING_KEY ? createHash("sha256").update(REPORT_SIGNING_KEY).digest("hex").slice(0, 12) : null;
    const stamp = { reportKey, generatedAt: signedAt, payloadHash, signature, keyId };
    const pages = reportPages(metrics, analysis, stamp);
    const pdf = makePdf(pages);
    const pdfHash = createHash("sha256").update(pdf).digest("hex");
    const html = htmlReport(metrics, analysis, pdfHash, stamp);
    await pool.query("UPDATE redom_ops_report_runs SET status='generated',metrics=$2::jsonb,analysis=$3::jsonb,data_coverage=$4::jsonb,pdf_base64=$5,pdf_sha256=$6,generated_at=$7,report_signature=$8,signature_payload_hash=$9,signature_key_id=$10,updated_at=now() WHERE id=$1",
      [runId, JSON.stringify(metrics), JSON.stringify(analysis), JSON.stringify(metrics.dataCoverage), pdf.toString("base64"), pdfHash, signedAt, signature, payloadHash, keyId]);
    await recordOpsEmailEvent({ logicalEmailId: reportKey, subsystem: "daily-operations-report", eventType: "attempted", recipient: RECIPIENT, metadata: { pdfSha256: pdfHash } }).catch(() => undefined);
    const send = await resend.emails.send({
      from: REPORT_FROM,
      to: [RECIPIENT],
      subject: `ReDom Daily Operations Intelligence — ${now.toISOString().slice(0,10)} — ${String(analysis.status ?? "unknown").toUpperCase()}`,
      html,
      attachments: [{ filename: `ReDom-Daily-Operations-${now.toISOString().slice(0,10)}.pdf`, content: pdf.toString("base64") }],
      headers: { "X-ReDom-Report-Key": reportKey },
    }, { idempotencyKey: "redom-daily-ops-" + reportKey });
    if (send.error) throw new Error("Resend rejected daily operations report: " + send.error.message);
    const messageId = send.data?.id ?? null;
    await pool.query("UPDATE redom_ops_report_runs SET status='sent',delivery_status='accepted',provider_message_id=$2,updated_at=now() WHERE id=$1", [runId,messageId]);
    await recordOpsEmailEvent({ logicalEmailId: reportKey, subsystem: "daily-operations-report", eventType: "accepted", recipient: RECIPIENT, providerMessageId: messageId, idempotencyKey: "ops-report:" + reportKey, metadata: { pdfSha256: pdfHash } });
    logger.info({ reportKey, recipient: RECIPIENT, providerMessageId: messageId, pdfSha256: pdfHash }, "ReDom daily operations report submitted to Resend");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query("UPDATE redom_ops_report_runs SET status='failed',delivery_status='failed',error_message=$2,updated_at=now() WHERE id=$1", [runId,message.slice(0,2000)]).catch(() => undefined);
    await pool.query(`INSERT INTO redom_ops_incidents (incident_key,title,subsystem,severity,status,description,evidence)
      VALUES ('daily-ops-report-delivery','Daily operations report generation or delivery failed','reporting','high','open',$1,$2::jsonb)
      ON CONFLICT (incident_key) DO UPDATE SET last_seen_at=now(),updated_at=now(),status='open',description=EXCLUDED.description,evidence=EXCLUDED.evidence`,
      [message.slice(0,1000),JSON.stringify({ reportKey })]).catch(() => undefined);
    await recordOpsEmailEvent({ logicalEmailId: reportKey, subsystem: "daily-operations-report", eventType: "failed", recipient: RECIPIENT, metadata: { error: message.slice(0, 500) } }).catch(() => undefined);
    logger.error({ reportKey, error: message }, "ReDom daily operations report failed");
  }
}

async function schedulerTick(): Promise<void> {
  if (inProcess) return;
  inProcess = true;
  try {
    const latest = await pool.query("SELECT report_key, period_end FROM redom_ops_report_runs WHERE status='sent' ORDER BY period_end DESC LIMIT 1");
    const latestKey = String(latest.rows[0]?.report_key ?? "");
    const revisionUpgradeDue = Boolean(latest.rows[0]) && !latestKey.endsWith("-v3");
    const due = !latest.rows[0] || revisionUpgradeDue || Date.now() - new Date(latest.rows[0].period_end).getTime() >= 86400000;
    if (due) await generateReport(new Date());
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "Daily operations scheduler tick failed");
  } finally { inProcess = false; }
}

let alertTimer: NodeJS.Timeout | undefined;
const alertBuckets = new Set<string>();

async function criticalAlertTick(): Promise<void> {
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  try {
    const [incidents, failures] = await Promise.all([
      pool.query(`SELECT incident_key,title,subsystem,severity,status,description,last_seen_at
        FROM redom_ops_incidents
        WHERE severity IN ('critical','high') AND status IN ('open','investigating')
          AND last_seen_at >= now() - interval '15 minutes'
        ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END,last_seen_at DESC LIMIT 10`),
      pool.query(`SELECT count(*)::int AS failures FROM redom_ops_email_events
        WHERE event_type IN ('failed','bounced','rejected') AND occurred_at >= now() - interval '15 minutes'`),
    ]);
    const incidentRows = incidents.rows as Array<Record<string, unknown>>;
    const failureCount = num(failures.rows[0]?.failures);
    const alerts: Array<{ key: string; title: string; detail: string; severity: string }> = incidentRows.map((row) => ({
      key: String(row.incident_key),
      title: String(row.title),
      detail: String(row.description),
      severity: String(row.severity),
    }));
    if (failureCount >= 3) alerts.push({
      key: "email-failure-burst",
      title: "Email delivery failure burst",
      detail: failureCount + " email failures, bounces, or rejections were recorded in the last 15 minutes.",
      severity: failureCount >= 10 ? "critical" : "high",
    });
    for (const alert of alerts) {
      const bucketKey = alert.key + ":" + hourBucket;
      if (alertBuckets.has(bucketKey)) continue;
      const observedAt = new Date(hourBucket * 3_600_000).toISOString();
      const idempotencyKey = "redom-ops-alert-" + createHash("sha256").update(JSON.stringify({ bucketKey, title: alert.title, detail: alert.detail, severity: alert.severity })).digest("hex").slice(0, 40);
      const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#F0F2F5;font-family:Arial,sans-serif;color:#1C1E21"><div style="max-width:640px;margin:auto;background:white;border:1px solid #DADDE1"><div style="background:#1877F2;color:white;padding:22px"><strong>ReDom · Operations Alert</strong></div><div style="padding:24px"><div style="font-size:12px;font-weight:bold;color:#B42318">${esc(alert.severity.toUpperCase())} PRIORITY</div><h1 style="font-size:22px">${esc(alert.title)}</h1><p style="line-height:1.6">${esc(alert.detail)}</p><p style="font-size:12px;color:#65676B">Observed at ${esc(observedAt)}. This alert is separate from the scheduled daily report.</p></div></div></body></html>`;
      try {
        const sent = await resend.emails.send({
          from: REPORT_FROM,
          to: [RECIPIENT],
          subject: `[ReDom ${alert.severity.toUpperCase()}] ${alert.title}`,
          html,
          text: `${alert.severity.toUpperCase()}: ${alert.title}\n\n${alert.detail}\n\nObserved at ${observedAt}.`,
          headers: { "X-ReDom-Alert-Key": idempotencyKey },
        }, { idempotencyKey });
        if (sent.error) throw new Error(sent.error.message);
        alertBuckets.add(bucketKey);
        await recordOpsEmailEvent({
          logicalEmailId: idempotencyKey,
          subsystem: "operations-alert",
          eventType: "accepted",
          recipient: RECIPIENT,
          providerMessageId: sent.data?.id ?? null,
          idempotencyKey: "ops-alert-ledger:" + idempotencyKey,
          metadata: { alertKey: alert.key, severity: alert.severity },
        });
        logger.warn({ alertKey: alert.key, severity: alert.severity, providerMessageId: sent.data?.id ?? null }, "ReDom operations alert submitted");
      } catch (error) {
        logger.error({ alertKey: alert.key, error: error instanceof Error ? error.message : String(error) }, "Unable to deliver ReDom operations alert");
      }
    }
    // Keep the in-memory suppression set bounded; provider/database idempotency
    // remains authoritative across process restarts.
    if (alertBuckets.size > 500) alertBuckets.clear();
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "Critical operations watch tick failed");
  }
}

export function startDailyOpsIntelligence(): void {
  if (timer) return;
  timer = setInterval(() => { void schedulerTick(); }, 60_000);
  timer.unref();
  alertTimer = setInterval(() => { void criticalAlertTick(); }, 5 * 60_000);
  alertTimer.unref();
  void schedulerTick();
  void criticalAlertTick();
  logger.info({ recipient: RECIPIENT, sender: REPORT_FROM, timezone: REPORT_TIMEZONE }, "Daily operations intelligence and critical alert watchers started");
}
export function stopDailyOpsIntelligence(): void {
  if (timer) clearInterval(timer);
  if (alertTimer) clearInterval(alertTimer);
  timer = undefined;
  alertTimer = undefined;
}