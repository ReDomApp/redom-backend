ALTER TABLE redom_payment_methods ADD COLUMN IF NOT EXISTS stripe_customer_id varchar(255);
ALTER TABLE redom_payment_methods ADD COLUMN IF NOT EXISTS stripe_payment_method_id varchar(255);
ALTER TABLE redom_payment_methods ADD COLUMN IF NOT EXISTS cardholder_name varchar(180);
ALTER TABLE redom_payment_methods ADD COLUMN IF NOT EXISTS card_fingerprint varchar(255);
ALTER TABLE redom_payment_methods ADD COLUMN IF NOT EXISTS status varchar(30) NOT NULL DEFAULT 'active';
CREATE UNIQUE INDEX IF NOT EXISTS redom_payment_methods_user_stripe_idx ON redom_payment_methods(user_id, stripe_payment_method_id) WHERE stripe_payment_method_id IS NOT NULL;
ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS backup_payment_methods_enabled boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS payment_method_removal_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_method_id uuid NOT NULL REFERENCES redom_payment_methods(id) ON DELETE CASCADE,
  channel_type varchar(20) NOT NULL,
  target_masked varchar(255) NOT NULL,
  code_hash varchar(128) NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 2,
  consumed_at timestamp with time zone,
  lock_until timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_method_removal_challenges_user_idx ON payment_method_removal_challenges(user_id, payment_method_id, created_at DESC);