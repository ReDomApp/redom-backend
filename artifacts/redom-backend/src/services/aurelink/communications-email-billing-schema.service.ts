import { pool } from "../../database/db";

/**
 * Additive outbound-email billing schema. Monthly allowances and prepaid email
 * credits are separate from the existing USD wallet used by pay-as-you-go.
 * No inbound mail, mailbox, MX receiving, IMAP or POP3 infrastructure is created.
 */
export async function ensureAurelinkEmailBillingSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aurelink_email_plan_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_code VARCHAR(32) NOT NULL UNIQUE,
      display_name VARCHAR(80) NOT NULL,
      min_monthly_emails BIGINT NOT NULL DEFAULT 0 CHECK(min_monthly_emails >= 0),
      max_monthly_emails BIGINT,
      daily_limit INTEGER,
      features JSONB NOT NULL DEFAULT '{}'::jsonb,
      enterprise BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(max_monthly_emails IS NULL OR max_monthly_emails >= min_monthly_emails)
    );
    INSERT INTO aurelink_email_plan_catalog(plan_code,display_name,min_monthly_emails,max_monthly_emails,daily_limit,features,enterprise,sort_order)
    VALUES
      ('free','Free',0,0,100,'{"marketing":true,"transactional":true,"stored_contacts":100000}'::jsonb,FALSE,0),
      ('starter','Starter',7000,21000,NULL,'{"basic_reporting":true,"email_support":true}'::jsonb,FALSE,1),
      ('standard','Standard',21000,149000,NULL,'{"marketing_automation":true,"ab_testing":true,"advanced_reporting":true}'::jsonb,FALSE,2),
      ('individual_max','Individual Max',150000,399000,NULL,'{"advanced_marketing":true,"ai_segmentation":true,"business_features":true}'::jsonb,FALSE,3),
      ('business','Business',600000,911000,NULL,'{"business_features":true,"priority_support":true}'::jsonb,FALSE,4),
      ('enterprise','Enterprise',1000000,NULL,NULL,'{"custom":true,"dedicated_ip_options":true,"custom_support":true}'::jsonb,TRUE,5)
    ON CONFLICT(plan_code) DO NOTHING;

    CREATE TABLE IF NOT EXISTS aurelink_email_plan_options (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id UUID NOT NULL REFERENCES aurelink_email_plan_catalog(id) ON DELETE RESTRICT,
      monthly_email_allowance BIGINT NOT NULL CHECK(monthly_email_allowance > 0),
      monthly_price_minor BIGINT NOT NULL CHECK(monthly_price_minor > 0),
      currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      effective_until TIMESTAMPTZ,
      created_by UUID REFERENCES aurelink_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(plan_id,monthly_email_allowance,effective_from),
      CHECK(effective_until IS NULL OR effective_until > effective_from)
    );
    INSERT INTO aurelink_email_plan_options(plan_id,monthly_email_allowance,monthly_price_minor)
    SELECT id,allowance,price FROM (
      VALUES ('starter',7000::bigint,500::bigint),
             ('standard',21000::bigint,2000::bigint),
             ('individual_max',150000::bigint,49000::bigint),
             ('business',600000::bigint,101000::bigint)
    ) AS seed(plan_code,allowance,price)
    JOIN aurelink_email_plan_catalog p ON p.plan_code=seed.plan_code
    WHERE NOT EXISTS (
      SELECT 1 FROM aurelink_email_plan_options o
      WHERE o.plan_id=p.id AND o.monthly_email_allowance=seed.allowance
    );

    CREATE TABLE IF NOT EXISTS aurelink_email_credit_packs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email_credits BIGINT NOT NULL CHECK(email_credits > 0),
      price_minor BIGINT NOT NULL CHECK(price_minor > 0),
      currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(email_credits,price_minor)
    );
    INSERT INTO aurelink_email_credit_packs(email_credits,price_minor)
    VALUES (1000,350),(5000,800),(10000,1300),(50000,4800),(100000,8500),(250000,19000)
    ON CONFLICT(email_credits,price_minor) DO NOTHING;
    UPDATE aurelink_email_credit_packs SET active=FALSE,updated_at=NOW() WHERE email_credits>250000;

    CREATE TABLE IF NOT EXISTS aurelink_email_prepaid_daily_usage (
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
      used_emails BIGINT NOT NULL DEFAULT 0 CHECK(used_emails >= 0),
      reserved_emails BIGINT NOT NULL DEFAULT 0 CHECK(reserved_emails >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(workspace_id,usage_date),
      CHECK(used_emails + reserved_emails <= 2500)
    );

    CREATE TABLE IF NOT EXISTS aurelink_email_billing_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reference VARCHAR(120) NOT NULL UNIQUE,
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      purchase_type VARCHAR(20) NOT NULL CHECK(purchase_type IN ('subscription','email_credits')),
      plan_option_id UUID REFERENCES aurelink_email_plan_options(id) ON DELETE RESTRICT,
      credit_pack_id UUID REFERENCES aurelink_email_credit_packs(id) ON DELETE RESTRICT,
      email_credits BIGINT,
      amount_minor BIGINT NOT NULL CHECK(amount_minor > 0),
      currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','paid','failed','cancelled','refunded')),
      stripe_checkout_session_id VARCHAR(180) UNIQUE,
      stripe_subscription_id VARCHAR(180),
      stripe_payment_intent_id VARCHAR(180),
      expires_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS account_country CHAR(2);
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS account_id VARCHAR(120);
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS email_checkout_token_hash CHAR(64);
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS email_checkout_expires_at TIMESTAMPTZ;
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS email_checkout_consumed_at TIMESTAMPTZ;
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_email_billing_email_token_hash_idx ON aurelink_email_billing_payments(email_checkout_token_hash) WHERE email_checkout_token_hash IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_email_billing_stripe_subscription_idx
      ON aurelink_email_billing_payments(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_email_billing_pending_subscription_idx
      ON aurelink_email_billing_payments(workspace_id) WHERE purchase_type='subscription' AND status='pending';
    CREATE INDEX IF NOT EXISTS aurelink_email_billing_payments_workspace_idx
      ON aurelink_email_billing_payments(workspace_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS aurelink_email_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      plan_option_id UUID NOT NULL REFERENCES aurelink_email_plan_options(id) ON DELETE RESTRICT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending_payment'
        CHECK(status IN ('pending_payment','active','past_due','cancelled','expired','suspended')),
      monthly_email_allowance BIGINT NOT NULL CHECK(monthly_email_allowance > 0),
      used_emails BIGINT NOT NULL DEFAULT 0 CHECK(used_emails >= 0),
      reserved_emails BIGINT NOT NULL DEFAULT 0 CHECK(reserved_emails >= 0),
      allow_prepaid_fallback BOOLEAN NOT NULL DEFAULT FALSE,
      billing_period_start TIMESTAMPTZ NOT NULL,
      billing_period_end TIMESTAMPTZ NOT NULL,
      stripe_customer_id VARCHAR(180),
      stripe_subscription_id VARCHAR(180),
      payment_reference VARCHAR(120),
      activated_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      stripe_event_created_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(billing_period_end > billing_period_start),
      CHECK(used_emails + reserved_emails <= monthly_email_allowance)
    );
    ALTER TABLE aurelink_email_subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE aurelink_email_subscriptions ADD COLUMN IF NOT EXISTS stripe_event_created_at TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_email_subscriptions_active_workspace_idx
      ON aurelink_email_subscriptions(workspace_id) WHERE status IN ('active','past_due','pending_payment');
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_email_subscriptions_stripe_idx
      ON aurelink_email_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS aurelink_email_billing_accounts (
      workspace_id UUID PRIMARY KEY REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      billing_mode VARCHAR(20) NOT NULL DEFAULT 'free' CHECK(billing_mode IN ('free','payg','subscription')),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE aurelink_email_billing_accounts ALTER COLUMN billing_mode SET DEFAULT 'free';
    CREATE TABLE IF NOT EXISTS aurelink_email_free_daily_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
      used_emails BIGINT NOT NULL DEFAULT 0 CHECK(used_emails >= 0),
      reserved_emails BIGINT NOT NULL DEFAULT 0 CHECK(reserved_emails >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(workspace_id,usage_date)
    );
    CREATE INDEX IF NOT EXISTS aurelink_email_free_daily_usage_date_idx
      ON aurelink_email_free_daily_usage(usage_date,workspace_id);

    CREATE TABLE IF NOT EXISTS aurelink_email_credit_wallets (
      workspace_id UUID PRIMARY KEY REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      balance_emails BIGINT NOT NULL DEFAULT 0 CHECK(balance_emails >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS aurelink_email_credit_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      entry_type VARCHAR(20) NOT NULL CHECK(entry_type IN ('purchase','usage','refund','adjustment')),
      direction VARCHAR(8) NOT NULL CHECK(direction IN ('credit','debit')),
      amount_emails BIGINT NOT NULL CHECK(amount_emails > 0),
      balance_after BIGINT NOT NULL CHECK(balance_after >= 0),
      reference VARCHAR(160) NOT NULL UNIQUE,
      payment_reference VARCHAR(120),
      description TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_email_credit_ledger_workspace_idx
      ON aurelink_email_credit_ledger(workspace_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS aurelink_email_usage_reservations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID NOT NULL UNIQUE REFERENCES aurelink_messages(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      source VARCHAR(16) NOT NULL CHECK(source IN ('free','subscription','prepaid','wallet')),
      subscription_id UUID REFERENCES aurelink_email_subscriptions(id) ON DELETE RESTRICT,
      units BIGINT NOT NULL CHECK(units > 0),
      unit_price_minor BIGINT,
      amount_minor BIGINT,
      wallet_reference VARCHAR(160),
      status VARCHAR(16) NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','captured','released','refunded','unknown')),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_email_usage_reservations_workspace_idx
      ON aurelink_email_usage_reservations(workspace_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS aurelink_email_billing_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID REFERENCES aurelink_communications_workspaces(id) ON DELETE SET NULL,
      actor_user_id UUID REFERENCES aurelink_users(id) ON DELETE SET NULL,
      action VARCHAR(48) NOT NULL,
      target_id UUID,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE aurelink_email_billing_audit ALTER COLUMN workspace_id DROP NOT NULL;
    CREATE INDEX IF NOT EXISTS aurelink_email_billing_audit_workspace_idx
      ON aurelink_email_billing_audit(workspace_id,created_at DESC);
    -- Country used for payment routing must be explicitly verified by Aurelink.
    ALTER TABLE aurelink_users ADD COLUMN IF NOT EXISTS country_code CHAR(2);
    ALTER TABLE aurelink_users ADD COLUMN IF NOT EXISTS country_verified_at TIMESTAMPTZ;
    ALTER TABLE aurelink_users ADD COLUMN IF NOT EXISTS country_verification_method VARCHAR(32);
    ALTER TABLE aurelink_users ADD COLUMN IF NOT EXISTS country_verification_reference VARCHAR(180);
    -- Provider-neutral payment metadata. USD remains the catalogue/accounting currency;
    -- provider_amount_minor/provider_currency store the actual local checkout amount.
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(16) NOT NULL DEFAULT 'stripe';
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS provider_currency CHAR(3) NOT NULL DEFAULT 'USD';
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS provider_amount_minor BIGINT;
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS paypal_order_id VARCHAR(180);
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS paypal_subscription_id VARCHAR(180);
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS paypal_capture_id VARCHAR(180);
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS paystack_reference VARCHAR(180);
    ALTER TABLE aurelink_email_billing_payments ADD COLUMN IF NOT EXISTS provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_email_billing_payments_paypal_order_idx ON aurelink_email_billing_payments(paypal_order_id) WHERE paypal_order_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_email_billing_payments_paypal_subscription_idx ON aurelink_email_billing_payments(paypal_subscription_id) WHERE paypal_subscription_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_email_billing_payments_paystack_ref_idx ON aurelink_email_billing_payments(paystack_reference) WHERE paystack_reference IS NOT NULL;

    ALTER TABLE aurelink_email_subscriptions ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(16) NOT NULL DEFAULT 'stripe';
    ALTER TABLE aurelink_email_subscriptions ADD COLUMN IF NOT EXISTS paypal_subscription_id VARCHAR(180);
    ALTER TABLE aurelink_email_subscriptions ADD COLUMN IF NOT EXISTS paystack_subscription_code VARCHAR(180);
    ALTER TABLE aurelink_email_subscriptions ADD COLUMN IF NOT EXISTS paystack_customer_code VARCHAR(180);
    ALTER TABLE aurelink_email_subscriptions ADD COLUMN IF NOT EXISTS paystack_email_token_encrypted TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_email_subscriptions_paypal_idx ON aurelink_email_subscriptions(paypal_subscription_id) WHERE paypal_subscription_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS aurelink_email_provider_plans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider VARCHAR(16) NOT NULL CHECK(provider IN ('paypal','paystack')),
      plan_option_id UUID NOT NULL REFERENCES aurelink_email_plan_options(id) ON DELETE CASCADE,
      currency CHAR(3) NOT NULL,
      provider_product_id VARCHAR(180),
      provider_plan_id VARCHAR(180) NOT NULL,
      amount_minor BIGINT NOT NULL CHECK(amount_minor > 0),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(provider,plan_option_id,currency),
      UNIQUE(provider,provider_plan_id)
    );

    CREATE TABLE IF NOT EXISTS aurelink_email_payment_webhook_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider VARCHAR(16) NOT NULL CHECK(provider IN ('paypal','paystack','stripe')),
      event_id VARCHAR(200) NOT NULL,
      event_type VARCHAR(160) NOT NULL,
      payload JSONB NOT NULL,
      processed_at TIMESTAMPTZ,
      processing_error TEXT,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(provider,event_id)
    );
    CREATE INDEX IF NOT EXISTS aurelink_email_payment_webhook_pending_idx
      ON aurelink_email_payment_webhook_events(provider,received_at) WHERE processed_at IS NULL;

    CREATE OR REPLACE FUNCTION aurelink_block_email_billing_ledger_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'Aurelink email credit ledger entries are immutable';
    END;
    $$;
    DROP TRIGGER IF EXISTS aurelink_email_credit_ledger_immutable ON aurelink_email_credit_ledger;
    CREATE TRIGGER aurelink_email_credit_ledger_immutable
      BEFORE UPDATE OR DELETE ON aurelink_email_credit_ledger
      FOR EACH ROW EXECUTE FUNCTION aurelink_block_email_billing_ledger_mutation();
  `);
}
