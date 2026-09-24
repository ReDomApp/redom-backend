ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS redom_transaction_id varchar(15);
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_redom_transaction_id_idx ON payment_transactions(redom_transaction_id) WHERE redom_transaction_id IS NOT NULL;
