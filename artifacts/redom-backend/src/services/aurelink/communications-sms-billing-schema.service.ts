import { pool } from "../../database/db";

/** The canonical, fixed USD SMS package catalogue. Prices are integer cents. */
export const AURELINK_SMS_PACKAGE_CATALOG = [
  { code: "sms_100", name: "Individual", segments: 100, priceMinor: 410, enterprise: false },
  { code: "sms_1k", name: "Starter", segments: 1_000, priceMinor: 4_100, enterprise: false },
  { code: "sms_5k", name: "Standard", segments: 5_000, priceMinor: 20_500, enterprise: false },
  { code: "sms_10k", name: "Plus", segments: 10_000, priceMinor: 41_000, enterprise: false },
  { code: "sms_30k", name: "Pro", segments: 30_000, priceMinor: 123_000, enterprise: false },
  { code: "sms_50k", name: "Individual Max", segments: 50_000, priceMinor: 205_000, enterprise: false },
  { code: "sms_100k", name: "Business", segments: 100_000, priceMinor: 410_000, enterprise: false },
  { code: "sms_300k", name: "Business Pro", segments: 300_000, priceMinor: 1_230_000, enterprise: false },
  { code: "sms_500k", name: "Business Max", segments: 500_000, priceMinor: 2_050_000, enterprise: false },
  { code: "sms_1m", name: "Enterprise", segments: 1_000_000, priceMinor: 4_100_000, enterprise: true },
] as const;

/** Isolated SMS prepaid inventory and billing reservations. Never references Mail credits. */
export async function ensureAurelinkSmsBillingSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aurelink_sms_package_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      package_code VARCHAR(40) NOT NULL UNIQUE,
      display_name VARCHAR(80),
      is_enterprise BOOLEAN NOT NULL DEFAULT FALSE,
      sms_segments BIGINT NOT NULL CHECK(sms_segments > 0),
      price_minor BIGINT NOT NULL CHECK(price_minor > 0),
      currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE aurelink_sms_package_catalog ADD COLUMN IF NOT EXISTS display_name VARCHAR(80);
    ALTER TABLE aurelink_sms_package_catalog ADD COLUMN IF NOT EXISTS is_enterprise BOOLEAN NOT NULL DEFAULT FALSE;

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
      payment_reference VARCHAR(40),
      description TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_sms_package_ledger_workspace_idx
      ON aurelink_sms_package_ledger(workspace_id,created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_sms_package_ledger_purchase_payment_uidx
      ON aurelink_sms_package_ledger(payment_reference)
      WHERE payment_reference IS NOT NULL AND entry_type='purchase' AND direction='credit';
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_sms_package_ledger_single_reversal_uidx
      ON aurelink_sms_package_ledger((metadata->>'reversalOfReference'))
      WHERE metadata ? 'reversalOfReference' AND metadata->>'reversalOfReference' IS NOT NULL;
    DO $$ BEGIN
      ALTER TABLE aurelink_sms_package_ledger ADD CONSTRAINT aurelink_sms_credit_ledger_reference_format_check
        CHECK(reference ~ '^[A-Z0-9]{18,19}$') NOT VALID;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

    CREATE TABLE IF NOT EXISTS aurelink_sms_package_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reference VARCHAR(40) NOT NULL UNIQUE,
      user_id UUID NOT NULL REFERENCES aurelink_users(id),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id),
      package_code VARCHAR(40) NOT NULL REFERENCES aurelink_sms_package_catalog(package_code),
      sms_segments BIGINT NOT NULL CHECK(sms_segments>0),
      amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
      currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
      payment_provider VARCHAR(12) NOT NULL CHECK(payment_provider IN ('paypal','paystack')),
      provider_currency CHAR(3) NOT NULL,
      provider_amount_minor BIGINT NOT NULL CHECK(provider_amount_minor>0),
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      provider_order_id VARCHAR(180),
      provider_transaction_reference VARCHAR(180),
      credit_ledger_reference VARCHAR(19),
      reference_format_version SMALLINT NOT NULL DEFAULT 2,
      provider_payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(provider_payment_status IN ('pending','verified','failed','refunded','reversed','disputed')),
      credit_allocation_status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK(credit_allocation_status IN ('pending','allocated','reversal_required','reversed','review_required')),
      payment_verified_at TIMESTAMPTZ,
      credit_allocated_at TIMESTAMPTZ,
      refunded_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK(refunded_amount_minor>=0),
      dispute_status VARCHAR(80),
      last_provider_event_at TIMESTAMPTZ,
      checkout_token_hash CHAR(64),
      checkout_token_expires_at TIMESTAMPTZ,
      checkout_token_consumed_at TIMESTAMPTZ,
      email_sent_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      account_country CHAR(2) NOT NULL,
      account_id VARCHAR(80) NOT NULL,
      pricing_country CHAR(2) NOT NULL,
      fx_rate NUMERIC(24,10),
      fx_source VARCHAR(80),
      fx_as_of TIMESTAMPTZ,
      provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(status IN ('pending','paid','failed','expired','refund_pending','partially_refunded','refunded','reversed','disputed'))
    );
    ALTER TABLE aurelink_sms_package_payments ALTER COLUMN status TYPE VARCHAR(20);
    ALTER TABLE aurelink_sms_package_payments ADD COLUMN IF NOT EXISTS credit_ledger_reference VARCHAR(19);
    ALTER TABLE aurelink_sms_package_payments ADD COLUMN IF NOT EXISTS provider_payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(provider_payment_status IN ('pending','verified','failed','refunded','reversed','disputed'));
    ALTER TABLE aurelink_sms_package_payments ADD COLUMN IF NOT EXISTS credit_allocation_status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK(credit_allocation_status IN ('pending','allocated','reversal_required','reversed','review_required'));
    ALTER TABLE aurelink_sms_package_payments ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;
    ALTER TABLE aurelink_sms_package_payments ADD COLUMN IF NOT EXISTS credit_allocated_at TIMESTAMPTZ;
    ALTER TABLE aurelink_sms_package_payments ADD COLUMN IF NOT EXISTS reference_format_version SMALLINT NOT NULL DEFAULT 1;
    ALTER TABLE aurelink_sms_package_payments ADD COLUMN IF NOT EXISTS refunded_amount_minor BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE aurelink_sms_package_payments ADD COLUMN IF NOT EXISTS dispute_status VARCHAR(80);
    ALTER TABLE aurelink_sms_package_payments ALTER COLUMN dispute_status TYPE VARCHAR(80);
    ALTER TABLE aurelink_sms_package_payments ADD COLUMN IF NOT EXISTS last_provider_event_at TIMESTAMPTZ;
    ALTER TABLE aurelink_sms_package_payments DROP CONSTRAINT IF EXISTS aurelink_sms_package_payments_status_check;
    ALTER TABLE aurelink_sms_package_payments ADD CONSTRAINT aurelink_sms_package_payments_status_check
      CHECK(status IN ('pending','paid','failed','expired','refund_pending','partially_refunded','refunded','reversed','disputed'));
    DO $$ BEGIN
      ALTER TABLE aurelink_sms_package_payments ADD CONSTRAINT aurelink_sms_purchase_reference_format_check
        CHECK(reference ~ '^[A-Z0-9]{18,19}$') NOT VALID;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS aurelink_sms_package_payments_user_idx
      ON aurelink_sms_package_payments(user_id,created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_sms_payment_provider_order_uidx
      ON aurelink_sms_package_payments(payment_provider,provider_order_id) WHERE provider_order_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_sms_payment_provider_txn_uidx
      ON aurelink_sms_package_payments(payment_provider,provider_transaction_reference) WHERE provider_transaction_reference IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_sms_payment_token_hash_uidx
      ON aurelink_sms_package_payments(checkout_token_hash) WHERE checkout_token_hash IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_sms_payment_ledger_reference_uidx
      ON aurelink_sms_package_payments(credit_ledger_reference) WHERE credit_ledger_reference IS NOT NULL;

    CREATE TABLE IF NOT EXISTS aurelink_sms_payment_reference_reservations (
      reference VARCHAR(40) PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS aurelink_sms_credit_reference_reservations (
      reference VARCHAR(19) PRIMARY KEY CHECK(reference ~ '^[A-Z0-9]{18,19}$'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS aurelink_sms_payment_reference_events (
      id BIGSERIAL PRIMARY KEY,
      payment_reference VARCHAR(40) NOT NULL REFERENCES aurelink_sms_package_payments(reference),
      event_type VARCHAR(64) NOT NULL,
      provider VARCHAR(12),
      provider_event_id VARCHAR(180),
      provider_order_id VARCHAR(180),
      provider_transaction_reference VARCHAR(180),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_sms_payment_reference_provider_event_uidx
      ON aurelink_sms_payment_reference_events(provider,provider_event_id)
      WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS aurelink_sms_payment_reference_events_payment_idx
      ON aurelink_sms_payment_reference_events(payment_reference,created_at);

    CREATE TABLE IF NOT EXISTS aurelink_sms_payment_refunds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_reference VARCHAR(40) NOT NULL REFERENCES aurelink_sms_package_payments(reference),
      provider VARCHAR(12) NOT NULL CHECK(provider IN ('paypal','paystack')),
      provider_refund_id VARCHAR(180),
      amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
      currency CHAR(3) NOT NULL,
      status VARCHAR(20) NOT NULL CHECK(status IN ('pending','succeeded','failed','reversed')),
      reason TEXT,
      provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(provider,provider_refund_id)
    );
    CREATE TABLE IF NOT EXISTS aurelink_sms_payment_disputes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_reference VARCHAR(40) NOT NULL REFERENCES aurelink_sms_package_payments(reference),
      provider VARCHAR(12) NOT NULL CHECK(provider IN ('paypal','paystack')),
      provider_dispute_id VARCHAR(180) NOT NULL,
      status VARCHAR(80) NOT NULL,
      reason VARCHAR(180),
      evidence_due_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      investigation_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
      provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(provider,provider_dispute_id)
    );

    CREATE TABLE IF NOT EXISTS aurelink_sms_payment_webhook_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider VARCHAR(12) NOT NULL CHECK(provider IN ('paypal','paystack')),
      event_id VARCHAR(180) NOT NULL,
      event_type VARCHAR(120) NOT NULL,
      payload JSONB NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      processing_error TEXT,
      UNIQUE(provider,event_id)
    );
    CREATE TABLE IF NOT EXISTS aurelink_sms_payment_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_reference VARCHAR(40) NOT NULL REFERENCES aurelink_sms_package_payments(reference),
      action VARCHAR(48) NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS aurelink_sms_purchase_receipt_outbox (
      payment_reference VARCHAR(40) PRIMARY KEY REFERENCES aurelink_sms_package_payments(reference),
      recipient_email VARCHAR(320) NOT NULL,
      payload JSONB NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_sms_receipt_outbox_due_idx
      ON aurelink_sms_purchase_receipt_outbox(next_attempt_at) WHERE sent_at IS NULL;
  `);

  // Backfill the new display fields before making them mandatory on upgraded databases.
  await pool.query("UPDATE aurelink_sms_package_catalog SET display_name=package_code WHERE display_name IS NULL");
  await pool.query("ALTER TABLE aurelink_sms_package_catalog ALTER COLUMN display_name SET NOT NULL");

  // Enforce the reviewed catalogue on existing installations too; stale prices must not survive.
  const values = AURELINK_SMS_PACKAGE_CATALOG.map((p) =>
    "('" + p.code + "','" + p.name + "'," + p.enterprise + "," + p.segments + "," + p.priceMinor + ",'USD')"
  ).join(",");
  await pool.query(
    "INSERT INTO aurelink_sms_package_catalog (package_code,display_name,is_enterprise,sms_segments,price_minor,currency) VALUES " +
    values +
    " ON CONFLICT(package_code) DO UPDATE SET display_name=EXCLUDED.display_name,is_enterprise=EXCLUDED.is_enterprise,sms_segments=EXCLUDED.sms_segments,price_minor=EXCLUDED.price_minor,currency='USD',active=TRUE,updated_at=NOW()"
  );
}
