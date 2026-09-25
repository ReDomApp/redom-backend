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
    redom_transaction_id varchar(15) UNIQUE,
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
  await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS country_code varchar(2)`);
  await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS customer_email varchar(255)`);
  await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS failure_message varchar(500)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS payment_transactions_country_idx ON payment_transactions(country_code)`);
  await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS redom_transaction_id varchar(15)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_redom_transaction_id_idx ON payment_transactions(redom_transaction_id) WHERE redom_transaction_id IS NOT NULL`);
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
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_settings (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    currency varchar(3) NOT NULL DEFAULT 'NGN',
    pin_enabled boolean NOT NULL DEFAULT false,
    biometric_enabled boolean NOT NULL DEFAULT false,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
  )`);
  await pool.query(`ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS currency_changed_at timestamp with time zone`);
  await pool.query(`ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS pin_hash varchar(255)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS redom_payment_methods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider varchar(30) NOT NULL DEFAULT 'paystack',
    authorization_code_encrypted text NOT NULL,
    authorization_signature varchar(255),
    customer_email varchar(255) NOT NULL,
    brand varchar(80),
    card_type varchar(120),
    last4 varchar(4),
    exp_month integer,
    exp_year integer,
    bank varchar(120),
    country_code varchar(2),
    currency varchar(3),
    reusable boolean NOT NULL DEFAULT true,
    active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS redom_payment_methods_user_signature_idx ON redom_payment_methods(user_id, authorization_signature) WHERE authorization_signature IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS redom_payment_methods_user_idx ON redom_payment_methods(user_id, created_at DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS redom_payment_addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    country_code varchar(2) NOT NULL,
    country_name varchar(120) NOT NULL,
    full_name varchar(180) NOT NULL,
    address_line1 varchar(255) NOT NULL,
    address_line2 varchar(255),
    city varchar(120) NOT NULL,
    state varchar(120),
    postal_code varchar(40),
    mapbox_place_id varchar(255),
    latitude numeric(10,7),
    longitude numeric(10,7),
    is_default boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS redom_payment_addresses_user_idx ON redom_payment_addresses(user_id, updated_at DESC)`);
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