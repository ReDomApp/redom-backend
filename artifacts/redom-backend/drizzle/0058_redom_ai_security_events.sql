CREATE TABLE IF NOT EXISTS redom_ai_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id varchar(80) NOT NULL,
  operation varchar(40) NOT NULL,
  policy_code varchar(80) NOT NULL,
  risk_level varchar(20) NOT NULL,
  action varchar(20) NOT NULL,
  document_class varchar(60),
  provider_signals jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS redom_ai_security_events_user_created_idx
  ON redom_ai_security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS redom_ai_security_events_request_idx
  ON redom_ai_security_events(request_id);
CREATE INDEX IF NOT EXISTS redom_ai_security_events_policy_idx
  ON redom_ai_security_events(policy_code, created_at DESC);
