ALTER TABLE "registration_flow_reservations"
  ADD COLUMN IF NOT EXISTS "date_of_birth" varchar(10);
--> statement-breakpoint
ALTER TABLE "registration_flow_reservations"
  ADD COLUMN IF NOT EXISTS "status" varchar(16) NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE "registration_flow_reservations"
  ADD CONSTRAINT "registration_flow_reservations_status_chk"
  CHECK ("status" IN ('active', 'completed', 'blocked'));
