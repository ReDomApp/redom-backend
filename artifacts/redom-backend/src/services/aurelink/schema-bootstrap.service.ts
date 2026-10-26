import type { Pool } from "pg";

export async function ensureAurelinkSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aurelink_quotes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

    CREATE TABLE IF NOT EXISTS aurelink_provider_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
      provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(provider, provider_order_id)
    );
    CREATE INDEX IF NOT EXISTS aurelink_orders_user_created_idx ON aurelink_provider_orders(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS aurelink_orders_status_idx ON aurelink_provider_orders(status);

    CREATE TABLE IF NOT EXISTS aurelink_payment_redemptions (
      payment_reference VARCHAR(100) PRIMARY KEY REFERENCES payment_transactions(reference) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quote_id UUID REFERENCES aurelink_quotes(id),
      product_kind VARCHAR(20) NOT NULL CHECK (product_kind IN ('activation','rental','esim','carrier_lookup')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_redemptions_user_idx ON aurelink_payment_redemptions(user_id, created_at DESC);
  `);
}
