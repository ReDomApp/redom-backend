ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS refund_status varchar(30);
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS refund_id varchar(100);
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS refund_amount_minor bigint;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS refund_requested_at timestamp with time zone;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS refund_expected_at timestamp with time zone;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS refund_processed_at timestamp with time zone;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS refund_error varchar(500);
