-- Aurelink profile identity changes: account-bound one-time codes and 30-day cooldowns.
CREATE TABLE IF NOT EXISTS aurelink_profile_change_locks (
  user_id uuid PRIMARY KEY REFERENCES aurelink_users(id) ON DELETE CASCADE,
  email_changed_at timestamptz,
  name_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aurelink_profile_change_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
  account_id varchar(32) NOT NULL,
  purpose varchar(24) NOT NULL CHECK (purpose IN ('email','name')),
  stage varchar(24) NOT NULL CHECK (stage IN ('current_email','new_email','confirm_name')),
  current_email varchar(255) NOT NULL,
  proposed_email varchar(255),
  proposed_first_name varchar(100),
  proposed_last_name varchar(100),
  code_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aurelink_profile_change_challenges_user_idx
  ON aurelink_profile_change_challenges(user_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS aurelink_profile_change_challenges_expiry_idx
  ON aurelink_profile_change_challenges(expires_at)
  WHERE consumed_at IS NULL;
