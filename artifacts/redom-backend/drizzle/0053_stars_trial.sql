ALTER TABLE redom_stars_transactions DROP CONSTRAINT IF EXISTS redom_stars_transactions_type_check;
ALTER TABLE redom_stars_transactions ADD CONSTRAINT redom_stars_transactions_type_check CHECK (type IN ('purchase','adjustment','refund','trial'));

CREATE TABLE IF NOT EXISTS redom_stars_trial_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference varchar(100) NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_session_id varchar(255) NOT NULL UNIQUE,
  stripe_setup_intent_id varchar(255),
  stripe_customer_id varchar(255),
  stripe_payment_method_id varchar(255),
  terms_version varchar(100) NOT NULL,
  consent_timestamp timestamptz NOT NULL,
  consent_disclosure text NOT NULL,
  country_code varchar(2) NOT NULL,
  currency varchar(3) NOT NULL,
  conversion_amount_minor bigint NOT NULL CHECK (conversion_amount_minor > 0),
  status varchar(30) NOT NULL DEFAULT 'open',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS redom_stars_trial_setups_user_idx ON redom_stars_trial_setups(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS redom_stars_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status varchar(30) NOT NULL,
  trial_started_at timestamptz NOT NULL,
  trial_ends_at timestamptz NOT NULL,
  stars_granted bigint NOT NULL DEFAULT 20,
  conversion_stars bigint NOT NULL DEFAULT 10,
  country_code varchar(2) NOT NULL,
  currency varchar(3) NOT NULL,
  conversion_amount_minor bigint NOT NULL,
  stripe_customer_id varchar(255),
  stripe_payment_method_id varchar(255),
  consent_terms_version varchar(100) NOT NULL,
  consent_timestamp timestamptz NOT NULL,
  consent_disclosure text NOT NULL,
  conversion_attempt_number integer NOT NULL DEFAULT 0,
  first_conversion_attempt_at timestamptz,
  retry_at timestamptz,
  final_conversion_status varchar(30),
  stripe_payment_intent_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS redom_stars_trials_due_idx ON redom_stars_trials(status,trial_ends_at,retry_at);
