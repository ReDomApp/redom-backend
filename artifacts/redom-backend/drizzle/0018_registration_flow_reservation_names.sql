ALTER TABLE "registration_flow_reservations"
  ADD COLUMN IF NOT EXISTS "first_name" varchar(100),
  ADD COLUMN IF NOT EXISTS "last_name" varchar(100);
