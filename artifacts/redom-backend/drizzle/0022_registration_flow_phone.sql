ALTER TABLE "registration_flow_reservations" ADD COLUMN IF NOT EXISTS "phone_number" varchar(32);
ALTER TABLE "registration_flow_reservations" ADD COLUMN IF NOT EXISTS "phone_country_code" varchar(2);
ALTER TABLE "registration_flow_reservations" ADD CONSTRAINT "registration_flow_reservations_phone_country_chk" CHECK ("phone_country_code" IS NULL OR "phone_country_code" ~ '^[A-Z]{2}$');
