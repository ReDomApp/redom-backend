import { pool } from "../database/db";

export async function ensureStarsSchema(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS redom_stars_accounts (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS redom_stars_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_transaction_id uuid REFERENCES payment_transactions(id) ON DELETE SET NULL,
    type varchar(20) NOT NULL CHECK (type IN ('purchase','adjustment','refund','trial')),
    stars bigint NOT NULL,
    balance_after bigint NOT NULL CHECK (balance_after >= 0),
    package_key varchar(50),
    country_code varchar(2),
    currency varchar(3),
    amount_minor bigint,
    reference varchar(100),
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS redom_stars_trial_setups (
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
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS redom_stars_trial_setups_user_idx ON redom_stars_trial_setups(user_id,created_at DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS redom_stars_trials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    status varchar(30) NOT NULL CHECK (status IN ('active','conversion_pending','conversion_paid','conversion_failed','retry_pending','conversion_failed_final')),
    trial_started_at timestamptz NOT NULL,
    trial_ends_at timestamptz NOT NULL,
    stars_granted bigint NOT NULL DEFAULT 20 CHECK (stars_granted = 20),
    conversion_stars bigint NOT NULL DEFAULT 10 CHECK (conversion_stars = 10),
    country_code varchar(2) NOT NULL,
    currency varchar(3) NOT NULL,
    conversion_amount_minor bigint NOT NULL CHECK (conversion_amount_minor > 0),
    stripe_customer_id varchar(255),
    stripe_payment_method_id varchar(255),
    consent_terms_version varchar(100) NOT NULL,
    consent_timestamp timestamptz NOT NULL,
    consent_disclosure text NOT NULL,
    conversion_attempt_number integer NOT NULL DEFAULT 0 CHECK (conversion_attempt_number IN (0,1,2)),
    first_conversion_attempt_at timestamptz,
    retry_at timestamptz,
    final_conversion_status varchar(30),
    stripe_payment_intent_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    failure_reason varchar(500),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS redom_stars_trials_due_idx ON redom_stars_trials(status, trial_ends_at, retry_at)`);
  await pool.query(`ALTER TABLE redom_stars_transactions ADD COLUMN IF NOT EXISTS reward_value_minor bigint`);
  await pool.query(`ALTER TABLE redom_stars_transactions ADD COLUMN IF NOT EXISTS creator_share_minor bigint`);
  await pool.query(`ALTER TABLE redom_stars_transactions ADD COLUMN IF NOT EXISTS redom_gross_minor bigint`);
  await pool.query(`CREATE INDEX IF NOT EXISTS redom_stars_transactions_user_idx ON redom_stars_transactions(user_id, created_at DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS stripe_stars_checkout_attempts (
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
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS stripe_stars_attempts_user_idx ON stripe_stars_checkout_attempts(user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS stripe_stars_attempts_status_idx ON stripe_stars_checkout_attempts(status, updated_at DESC)`);
  await pool.query(`ALTER TABLE stripe_stars_checkout_attempts ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0`);

  await pool.query(`CREATE TABLE IF NOT EXISTS redom_stars_gifts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stars bigint NOT NULL CHECK (stars > 0),
    reward_value_minor bigint NOT NULL CHECK (reward_value_minor > 0),
    creator_share_minor bigint NOT NULL CHECK (creator_share_minor >= 0),
    redom_gross_minor bigint NOT NULL CHECK (redom_gross_minor >= 0),
    creator_eligible boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS redom_stars_gifts_sender_idx ON redom_stars_gifts(sender_user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS redom_stars_gifts_recipient_idx ON redom_stars_gifts(recipient_user_id, created_at DESC)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS redom_creator_earnings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gift_id uuid NOT NULL UNIQUE REFERENCES redom_stars_gifts(id) ON DELETE RESTRICT,
    stars bigint NOT NULL CHECK (stars > 0),
    reward_value_minor bigint NOT NULL CHECK (reward_value_minor > 0),
    creator_share_minor bigint NOT NULL CHECK (creator_share_minor >= 0),
    status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','eligible','processing','paid','held','reversed')),
    earning_month date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS redom_creator_earnings_creator_idx ON redom_creator_earnings(creator_user_id, earning_month DESC, created_at DESC)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS redom_creator_payouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    earning_month date NOT NULL,
    stars bigint NOT NULL CHECK (stars > 0),
    gross_reward_minor bigint NOT NULL CHECK (gross_reward_minor >= 0),
    creator_payout_minor bigint NOT NULL CHECK (creator_payout_minor >= 0),
    currency varchar(3) NOT NULL DEFAULT 'USD',
    status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed','held')),
    provider varchar(30),
    provider_payout_id varchar(255),
    failure_reason varchar(500),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (creator_user_id, earning_month)
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS redom_creator_payouts_status_idx ON redom_creator_payouts(status, earning_month DESC)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS redom_creator_payout_settings (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    minimum_payout_minor bigint NOT NULL DEFAULT 2500 CHECK (minimum_payout_minor >= 0),
    payout_currency varchar(3) NOT NULL DEFAULT 'USD',
    stripe_connect_account_id varchar(255),
    stripe_connect_status varchar(30) NOT NULL DEFAULT 'not_connected',
    payout_enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
}
