ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS payment_provider varchar(20);
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS provider_transaction_id varchar(255);
ALTER TABLE payment_transactions ALTER COLUMN redom_transaction_id TYPE varchar(19);
CREATE INDEX IF NOT EXISTS payment_transactions_provider_idx ON payment_transactions(payment_provider, created_at DESC);
