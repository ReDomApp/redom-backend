-- ReDom Daily Operations Intelligence: durable email ledger, incident register and report archive.
CREATE TABLE IF NOT EXISTS redom_ops_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logical_email_id text NOT NULL,
  provider_message_id text,
  subsystem varchar(80) NOT NULL,
  event_type varchar(40) NOT NULL,
  recipient_domain varchar(255),
  case_id uuid,
  idempotency_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redom_ops_email_event_type_check CHECK (event_type IN ('queued','attempted','accepted','delivered','deferred','bounced','rejected','failed','duplicate_suppressed','duplicate_delivery','complained'))
);
CREATE INDEX IF NOT EXISTS redom_ops_email_events_time_idx ON redom_ops_email_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS redom_ops_email_events_logical_idx ON redom_ops_email_events(logical_email_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS redom_ops_email_events_subsystem_idx ON redom_ops_email_events(subsystem, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS redom_ops_email_events_idempotency_idx ON redom_ops_email_events(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS redom_ops_email_events_provider_idx ON redom_ops_email_events(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS redom_ops_email_events_case_idx ON redom_ops_email_events(case_id, occurred_at DESC) WHERE case_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS redom_ops_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_key text NOT NULL UNIQUE,
  title text NOT NULL,
  subsystem varchar(100) NOT NULL,
  severity varchar(20) NOT NULL DEFAULT 'warning',
  status varchar(24) NOT NULL DEFAULT 'open',
  description text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  root_cause text,
  resolution text,
  verification_evidence text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redom_ops_incident_severity_check CHECK (severity IN ('info','warning','high','critical')),
  CONSTRAINT redom_ops_incident_status_check CHECK (status IN ('open','investigating','mitigated','resolved','closed'))
);
CREATE INDEX IF NOT EXISTS redom_ops_incidents_status_idx ON redom_ops_incidents(status, severity, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS redom_ops_report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key text NOT NULL UNIQUE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  timezone varchar(80) NOT NULL DEFAULT 'UTC',
  status varchar(24) NOT NULL DEFAULT 'running',
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_base64 text,
  pdf_sha256 text,
  report_signature text,
  signature_payload_hash text,
  signature_key_id text,
  provider_message_id text,
  delivery_status varchar(24) NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  error_message text,
  generated_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redom_ops_report_status_check CHECK (status IN ('running','generated','sent','failed')),
  CONSTRAINT redom_ops_delivery_status_check CHECK (delivery_status IN ('pending','accepted','delivered','failed','unknown'))
);
CREATE INDEX IF NOT EXISTS redom_ops_report_runs_period_idx ON redom_ops_report_runs(period_end DESC);

CREATE TABLE IF NOT EXISTS redom_ops_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action varchar(80) NOT NULL,
  report_key text,
  outcome varchar(24) NOT NULL DEFAULT 'success',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS redom_ops_admin_audit_time_idx ON redom_ops_admin_audit(created_at DESC);
