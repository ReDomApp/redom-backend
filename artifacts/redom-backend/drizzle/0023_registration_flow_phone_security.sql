ALTER TABLE "registration_flow_reservations"
  ADD COLUMN IF NOT EXISTS "phone_lookup_status" varchar(32),
  ADD COLUMN IF NOT EXISTS "phone_valid" boolean,
  ADD COLUMN IF NOT EXISTS "phone_active" boolean,
  ADD COLUMN IF NOT EXISTS "phone_voip" boolean,
  ADD COLUMN IF NOT EXISTS "phone_fraud_score" integer,
  ADD COLUMN IF NOT EXISTS "phone_line_type" varchar(64),
  ADD COLUMN IF NOT EXISTS "phone_carrier" varchar(255),
  ADD COLUMN IF NOT EXISTS "phone_lookup_country_code" varchar(2),
  ADD COLUMN IF NOT EXISTS "phone_lookup_request_id" varchar(128),
  ADD COLUMN IF NOT EXISTS "phone_lookup_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "ip_fraud_score" integer,
  ADD COLUMN IF NOT EXISTS "ip_proxy" boolean,
  ADD COLUMN IF NOT EXISTS "ip_vpn" boolean,
  ADD COLUMN IF NOT EXISTS "ip_tor" boolean,
  ADD COLUMN IF NOT EXISTS "ip_bot_status" boolean,
  ADD COLUMN IF NOT EXISTS "ip_country_code" varchar(2);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'registration_flow_reservations_phone_lookup_country_chk'
      AND conrelid = 'registration_flow_reservations'::regclass
  ) THEN
    ALTER TABLE "registration_flow_reservations"
      ADD CONSTRAINT "registration_flow_reservations_phone_lookup_country_chk"
      CHECK ("phone_lookup_country_code" IS NULL OR "phone_lookup_country_code" ~ '^[A-Z]{2}$');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'registration_flow_reservations_ip_country_chk'
      AND conrelid = 'registration_flow_reservations'::regclass
  ) THEN
    ALTER TABLE "registration_flow_reservations"
      ADD CONSTRAINT "registration_flow_reservations_ip_country_chk"
      CHECK ("ip_country_code" IS NULL OR "ip_country_code" ~ '^[A-Z]{2}$');
  END IF;
END $$;
