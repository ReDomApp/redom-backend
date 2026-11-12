import { pool } from "../../database/db";

/** Isolated SMS prepaid inventory and billing reservations. Never references Mail credits. */
export async function ensureAurelinkSmsBillingSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aurelink_sms_package_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      package_code VARCHAR(40) NOT NULL UNIQUE,
      sms_segments BIGINT NOT NULL CHECK(sms_segments > 0),
      price_minor BIGINT NOT NULL CHECK(price_minor > 0),
      currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO aurelink_sms_package_catalog(package_code,sms_segments,price_minor)
    VALUES
      ('sms_100',100,410),('sms_1k',1000,4100),('sms_5k',5000,20500),
      ('sms_10k',10000,41000),('sms_30k',30000,123000),
      ('sms_50k',50000,205000),('sms_100k',100000,410000),
      ('sms_300k',300000,1230000),('sms_500k',500000,2050000),
      ('sms_1m',1000000,4100000)
    ON CONFLICT(package_code) DO NOTHING;

    CREATE TABLE IF NOT EXISTS aurelink_sms_package_wallets (
      workspace_id UUID PRIMARY KEY REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      balance_segments BIGINT NOT NULL DEFAULT 0 CHECK(balance_segments >= 0),
      reserved_segments BIGINT NOT NULL DEFAULT 0 CHECK(reserved_segments >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS aurelink_sms_package_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      entry_type VARCHAR(20) NOT NULL CHECK(entry_type IN ('purchase','usage','refund','adjustment')),
      direction VARCHAR(8) NOT NULL CHECK(direction IN ('credit','debit')),
      amount_segments BIGINT NOT NULL CHECK(amount_segments > 0),
      balance_after BIGINT NOT NULL CHECK(balance_after >= 0),
      reference VARCHAR(180) NOT NULL UNIQUE,
      payment_reference VARCHAR(180),
      description TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_sms_package_ledger_workspace_idx
      ON aurelink_sms_package_ledger(workspace_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS aurelink_sms_usage_reservations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID NOT NULL UNIQUE REFERENCES aurelink_messages(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      source VARCHAR(12) NOT NULL CHECK(source IN ('package','wallet')),
      units BIGINT NOT NULL CHECK(units > 0),
      unit_price_minor BIGINT,
      amount_minor BIGINT,
      wallet_reference VARCHAR(160),
      status VARCHAR(16) NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','captured','refunded','unknown')),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_sms_usage_reservations_workspace_idx
      ON aurelink_sms_usage_reservations(workspace_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS aurelink_sms_billing_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID REFERENCES aurelink_communications_workspaces(id) ON DELETE SET NULL,
      actor_user_id UUID REFERENCES aurelink_users(id) ON DELETE SET NULL,
      action VARCHAR(48) NOT NULL,
      target_id UUID,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE OR REPLACE FUNCTION aurelink_block_sms_package_ledger_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Aurelink SMS package ledger entries are immutable'; END;
    $$;
    DROP TRIGGER IF EXISTS aurelink_sms_package_ledger_immutable ON aurelink_sms_package_ledger;
    CREATE TRIGGER aurelink_sms_package_ledger_immutable
      BEFORE UPDATE OR DELETE ON aurelink_sms_package_ledger
      FOR EACH ROW EXECUTE FUNCTION aurelink_block_sms_package_ledger_mutation();
  `);
}
