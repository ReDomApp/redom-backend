import type { Pool } from "pg";

export async function ensureAurelinkSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aurelink_quotes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      aurelink_user_id UUID,
      product_kind VARCHAR(20) NOT NULL CHECK (product_kind IN ('activation','rental','esim')),
      country VARCHAR(8) NOT NULL,
      service VARCHAR(100),
      provider_max_price NUMERIC(12,4) NOT NULL CHECK (provider_max_price > 0),
      retail_amount_minor BIGINT NOT NULL CHECK (retail_amount_minor > 0),
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      provider_pricing JSONB NOT NULL DEFAULT '{}'::jsonb,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_quotes_user_expiry_idx ON aurelink_quotes(user_id, expires_at);

    CREATE TABLE IF NOT EXISTS aurelink_admin_identity (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
      id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO aurelink_admin_identity (singleton) VALUES (TRUE) ON CONFLICT (singleton) DO NOTHING;

    CREATE TABLE IF NOT EXISTS aurelink_provider_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      aurelink_user_id UUID,
      aurelink_order_id VARCHAR(8),
      quote_id UUID REFERENCES aurelink_quotes(id),
      product_kind VARCHAR(20) NOT NULL CHECK (product_kind IN ('activation','rental','esim','carrier_lookup')),
      provider VARCHAR(30) NOT NULL DEFAULT 'smspool',
      provider_order_id VARCHAR(160) NOT NULL,
      phone_number VARCHAR(40),
      country VARCHAR(8),
      service VARCHAR(100),
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      provider_cost NUMERIC(12,4),
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      carrier_name TEXT,
      line_type TEXT,
      verification_status VARCHAR(24) NOT NULL DEFAULT 'unverified',
      verified_at TIMESTAMPTZ,
      sms_received_at TIMESTAMPTZ,
      rental_started_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      last_provider_check_at TIMESTAMPTZ,
      provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(provider, provider_order_id)
    );
    ALTER TABLE aurelink_provider_orders ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE aurelink_quotes ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE aurelink_quotes ADD COLUMN IF NOT EXISTS aurelink_user_id UUID;
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS aurelink_user_id UUID;
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS aurelink_order_id VARCHAR(8);
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_orders_display_id_unique ON aurelink_provider_orders(aurelink_order_id) WHERE aurelink_order_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS aurelink_quotes_aurelink_user_idx ON aurelink_quotes(aurelink_user_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS aurelink_orders_aurelink_user_idx ON aurelink_provider_orders(aurelink_user_id,created_at DESC);
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS admin_account_id UUID REFERENCES aurelink_admin_identity(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS aurelink_orders_admin_created_idx ON aurelink_provider_orders(admin_account_id, created_at DESC);
    -- Additive migration for databases that already created the initial AURELINK schema.
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS carrier_name TEXT;
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS line_type TEXT;
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS verification_status VARCHAR(24) NOT NULL DEFAULT 'unverified';
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS sms_received_at TIMESTAMPTZ;
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS rental_started_at TIMESTAMPTZ;
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS last_provider_check_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS aurelink_orders_user_created_idx ON aurelink_provider_orders(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS aurelink_orders_status_idx ON aurelink_provider_orders(status);
    CREATE INDEX IF NOT EXISTS aurelink_orders_expiry_idx ON aurelink_provider_orders(expires_at) WHERE expires_at IS NOT NULL;



    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS aurelink_dedicated_renewal_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES aurelink_provider_orders(id) ON DELETE CASCADE,
      aurelink_user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      scheduled_expiry_at TIMESTAMPTZ NOT NULL,
      amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      status VARCHAR(32) NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled','awaiting_topup','processing','succeeded','failed','reconciliation_required')),
      idempotency_key UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL,
      provider_expiry_at TIMESTAMPTZ,
      provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
      failure_code VARCHAR(100),
      failure_message TEXT,
      wallet_debit_reference VARCHAR(140) UNIQUE,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(order_id, scheduled_expiry_at)
    );
    CREATE INDEX IF NOT EXISTS aurelink_dedicated_renewal_due_idx
      ON aurelink_dedicated_renewal_attempts(status,next_attempt_at);
    CREATE TABLE IF NOT EXISTS aurelink_renewal_topup_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      aurelink_user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      account_id VARCHAR(16) NOT NULL,
      order_id UUID NOT NULL REFERENCES aurelink_provider_orders(id) ON DELETE CASCADE,
      renewal_attempt_id UUID NOT NULL REFERENCES aurelink_dedicated_renewal_attempts(id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
      currency CHAR(3) NOT NULL,
      paystack_reference VARCHAR(120) NOT NULL UNIQUE,\n      checkout_url TEXT NOT NULL,
      paystack_transaction_id VARCHAR(120),
      gateway_status VARCHAR(40),
      receipt_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_renewal_tokens_expiry_idx
      ON aurelink_renewal_topup_tokens(expires_at) WHERE consumed_at IS NULL AND revoked_at IS NULL;
\n    CREATE TABLE IF NOT EXISTS aurelink_wallets (
      user_id UUID PRIMARY KEY REFERENCES aurelink_users(id) ON DELETE CASCADE,
      balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS aurelink_wallet_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      entry_type VARCHAR(24) NOT NULL CHECK (entry_type IN ('topup','purchase','refund','renewal','adjustment')),
      direction VARCHAR(8) NOT NULL CHECK (direction IN ('credit','debit')),
      amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
      balance_after_minor BIGINT NOT NULL CHECK (balance_after_minor >= 0),
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      reference VARCHAR(120) NOT NULL UNIQUE,
      order_id UUID,
      payment_reference VARCHAR(100),
      description TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Aurelink wallets belong to Aurelink identities, never ReDom users.
    -- Refuse to rebind any existing balance to a different identity.
    DO $aurelink_wallet_migration$
    DECLARE
      invalid_wallets BIGINT;
      invalid_ledger BIGINT;
    BEGIN
      SELECT COUNT(*) INTO invalid_wallets FROM aurelink_wallets w
        LEFT JOIN aurelink_users u ON u.id = w.user_id WHERE u.id IS NULL;
      SELECT COUNT(*) INTO invalid_ledger FROM aurelink_wallet_ledger l
        LEFT JOIN aurelink_users u ON u.id = l.user_id WHERE u.id IS NULL;
      IF invalid_wallets > 0 OR invalid_ledger > 0 THEN
        RAISE EXCEPTION 'Aurelink wallet identity migration blocked: existing wallet/ledger rows do not map to aurelink_users. Reconcile balances before migration.';
      END IF;
      ALTER TABLE aurelink_wallets DROP CONSTRAINT IF EXISTS aurelink_wallets_user_id_fkey;
      ALTER TABLE aurelink_wallet_ledger DROP CONSTRAINT IF EXISTS aurelink_wallet_ledger_user_id_fkey;
      ALTER TABLE aurelink_wallets ADD CONSTRAINT aurelink_wallets_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES aurelink_users(id) ON DELETE CASCADE;
      ALTER TABLE aurelink_wallet_ledger ADD CONSTRAINT aurelink_wallet_ledger_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES aurelink_users(id) ON DELETE CASCADE;
    END
    $aurelink_wallet_migration$;
\n    CREATE INDEX IF NOT EXISTS aurelink_wallet_ledger_user_created_idx ON aurelink_wallet_ledger(user_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS aurelink_wallet_topups (
      reference VARCHAR(120) PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      credited_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS retail_amount_minor BIGINT;
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS wallet_debit_reference VARCHAR(120);
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS refund_reference VARCHAR(120);
    ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS first_purchase_discount BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS aurelink_payment_redemptions (
      payment_reference VARCHAR(100) PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quote_id UUID REFERENCES aurelink_quotes(id),
      product_kind VARCHAR(20) NOT NULL CHECK (product_kind IN ('activation','rental','esim','carrier_lookup')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_redemptions_user_idx ON aurelink_payment_redemptions(user_id, created_at DESC);
  `);
}
