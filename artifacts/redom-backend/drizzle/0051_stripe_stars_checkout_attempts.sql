CREATE TABLE IF NOT EXISTS stripe_stars_checkout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference varchar(100) NOT NULL UNIQUE,
  stripe_session_id varchar(255) UNIQUE,
  stripe_payment_intent_id varchar(255),
  package_key varchar(50) NOT NULL,
  stars bigint NOT NULL CHECK (stars > 0),
  country_code varchar(2) NOT NULL,
  currency varchar(3) NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  customer_email varchar(255) NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number IN (1,2)),
  status varchar(30) NOT NULL DEFAULT 'open',
  failure_message varchar(500),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS stripe_stars_attempts_user_idx
  ON stripe_stars_checkout_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stripe_stars_attempts_status_idx
  ON stripe_stars_checkout_attempts(status, updated_at DESC);
