CREATE TABLE IF NOT EXISTS redom_stars_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS redom_stars_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_transaction_id uuid REFERENCES payment_transactions(id) ON DELETE SET NULL,
  type varchar(20) NOT NULL CHECK (type IN ('purchase','adjustment','refund')),
  stars bigint NOT NULL,
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  package_key varchar(50),
  country_code varchar(2),
  currency varchar(3),
  amount_minor bigint,
  reference varchar(100),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS redom_stars_transactions_user_idx
  ON redom_stars_transactions(user_id, created_at DESC);

ALTER TABLE payment_settings
  ADD COLUMN IF NOT EXISTS pin_hash varchar(255);

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS country_code varchar(2);

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS customer_email varchar(255);

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS failure_message varchar(500);

CREATE INDEX IF NOT EXISTS payment_transactions_country_idx
  ON payment_transactions(country_code);