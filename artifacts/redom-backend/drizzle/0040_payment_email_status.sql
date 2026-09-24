ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS customer_email_status varchar(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS customer_email_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS customer_email_error varchar(500);
