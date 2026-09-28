ALTER TABLE stripe_stars_checkout_attempts
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0;
