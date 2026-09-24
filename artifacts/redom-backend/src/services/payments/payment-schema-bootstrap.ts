import { pool } from "../../database/db";

export async function ensurePaymentSchema(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_key varchar(50) NOT NULL UNIQUE,
    name varchar(120) NOT NULL,
    amount_minor bigint NOT NULL,
    currency varchar(3) NOT NULL,
    interval varchar(20) NOT NULL DEFAULT 'monthly',
    external_plan_code varchar(100),
    active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id uuid REFERENCES verification_subscriptions(id) ON DELETE SET NULL,
    plan_id uuid REFERENCES payment_plans(id) ON DELETE SET NULL,
    reference varchar(100) NOT NULL UNIQUE,
    external_transaction_id bigint,
    amount_minor bigint NOT NULL,
    currency varchar(3) NOT NULL,
    purpose varchar(40) NOT NULL,
    status varchar(30) NOT NULL DEFAULT 'initialized',
    checkout_url text,
    access_code varchar(255),
    gateway_status varchar(50),
    paid_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS payment_transactions_user_idx ON payment_transactions(user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS payment_transactions_subscription_idx ON payment_transactions(subscription_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS payment_transactions_status_idx ON payment_transactions(status, created_at DESC)`);
  await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS customer_email_status varchar(20) NOT NULL DEFAULT 'pending'`);
  await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS customer_email_sent_at timestamp with time zone`);
  await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS customer_email_error varchar(500)`);
  await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS refund_status varchar(30)`);
  await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS refund_id varchar(100)`);
  await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS refund_amount_minor bigint`);
  await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS refund_requested_at timestamp with time zone`);
  await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS refund_expected_at timestamp with time zone`);
  await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS refund_processed_at timestamp with time zone`);
  await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS refund_error varchar(500);`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    verification_subscription_id uuid REFERENCES verification_subscriptions(id) ON DELETE SET NULL,
    plan_id uuid REFERENCES payment_plans(id) ON DELETE SET NULL,
    external_subscription_code varchar(120) NOT NULL UNIQUE,
    external_customer_code varchar(120),
    external_email_token varchar(255),
    status varchar(30) NOT NULL DEFAULT 'active',
    next_payment_at timestamp with time zone,
    disabled_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS payment_subscriptions_user_idx ON payment_subscriptions(user_id, created_at DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_key varchar(255) NOT NULL UNIQUE,
    event_type varchar(100) NOT NULL,
    reference varchar(100),
    payload jsonb NOT NULL,
    processed boolean NOT NULL DEFAULT false,
    processing_error text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    processed_at timestamp with time zone
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS payment_webhook_reference_idx ON payment_webhook_events(reference, created_at DESC)`);
}