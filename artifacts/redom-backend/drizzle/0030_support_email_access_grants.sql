CREATE TABLE IF NOT EXISTS support_email_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  recipient_email varchar(255) NOT NULL,
  purpose varchar(80) NOT NULL DEFAULT 'view_case',
  token_hash char(64) NOT NULL UNIQUE,
  status varchar(16) NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_email_access_grants_status_check CHECK (status IN ('active','consumed','expired','revoked'))
);
CREATE INDEX IF NOT EXISTS support_email_access_grants_lookup_idx
  ON support_email_access_grants(case_id, lower(recipient_email), purpose, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS support_email_access_grants_expiry_idx
  ON support_email_access_grants(expires_at) WHERE status = 'active';
