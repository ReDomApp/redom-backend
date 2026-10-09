-- ReDom Temporary Support Email Access
-- The raw bearer token is encrypted for safe reuse; token_hash is used for lookup.
CREATE TABLE IF NOT EXISTS support_email_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  purpose text NOT NULL DEFAULT 'case_view',
  token_hash text NOT NULL UNIQUE,
  token_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','consumed','expired','revoked')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS support_email_access_grants_lookup_idx
  ON support_email_access_grants(case_id, lower(recipient_email), purpose, expires_at DESC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS support_email_access_grants_expiry_idx
  ON support_email_access_grants(expires_at) WHERE status = 'active';
