CREATE TABLE IF NOT EXISTS "registration_flow_memory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "flow_id" varchar(16) NOT NULL,
  "reservation_id" uuid NOT NULL,
  "completion_state" varchar(32) NOT NULL DEFAULT 'phone_verified',
  "registered_tables" jsonb NOT NULL,
  "memory" jsonb NOT NULL,
  "registered_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "registration_flow_memory_flow_id_unique" ON "registration_flow_memory" ("flow_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "registration_flow_memory_reservation_id_unique" ON "registration_flow_memory" ("reservation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_flow_memory_flow_id_idx" ON "registration_flow_memory" ("flow_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_flow_memory_reservation_id_idx" ON "registration_flow_memory" ("reservation_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_flow_memory_completion_state_chk'
      AND conrelid = 'registration_flow_memory'::regclass
  ) THEN
    ALTER TABLE "registration_flow_memory"
      ADD CONSTRAINT "registration_flow_memory_completion_state_chk"
      CHECK ("completion_state" IN ('phone_verified', 'completed'));
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_flow_memory_flow_id_format_chk'
      AND conrelid = 'registration_flow_memory'::regclass
  ) THEN
    ALTER TABLE "registration_flow_memory"
      ADD CONSTRAINT "registration_flow_memory_flow_id_format_chk"
      CHECK ("flow_id" ~ '^[0-9]{6,16}$');
  END IF;
END $$;
