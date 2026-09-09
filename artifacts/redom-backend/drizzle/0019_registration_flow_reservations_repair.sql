ALTER TABLE "registration_flow_reservations"
  ADD COLUMN IF NOT EXISTS "flow_id" varchar(16);
--> statement-breakpoint
ALTER TABLE "registration_flow_reservations"
  ADD COLUMN IF NOT EXISTS "device_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "registration_flow_reservations"
  ADD COLUMN IF NOT EXISTS "first_name" varchar(100);
--> statement-breakpoint
ALTER TABLE "registration_flow_reservations"
  ADD COLUMN IF NOT EXISTS "last_name" varchar(100);
--> statement-breakpoint
ALTER TABLE "registration_flow_reservations"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "registration_flow_reservations"
  ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint
UPDATE "registration_flow_reservations"
SET "expires_at" = now() + interval '15 minutes'
WHERE "expires_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "registration_flow_reservations"
  ALTER COLUMN "expires_at" SET NOT NULL;
--> statement-breakpoint
UPDATE "registration_flow_reservations"
SET "created_at" = now()
WHERE "created_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "registration_flow_reservations"
  ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "registration_flow_reservations"
  ALTER COLUMN "created_at" SET NOT NULL;
--> statement-breakpoint
DO $$
DECLARE
  reservation_record RECORD;
  candidate text;
BEGIN
  FOR reservation_record IN
    SELECT "id"
    FROM "registration_flow_reservations"
    WHERE "flow_id" IS NULL
  LOOP
    LOOP
      candidate := substr(translate(md5(reservation_record."id"::text || clock_timestamp()::text || random()::text), 'abcdef', '012345'), 1, 16);
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM "registration_flow_reservations" AS existing
        WHERE existing."flow_id" = candidate
      );
    END LOOP;

    UPDATE "registration_flow_reservations"
    SET "flow_id" = candidate
    WHERE "id" = reservation_record."id";
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "registration_flow_reservations"
  ALTER COLUMN "flow_id" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'registration_flow_reservations_flow_id_unique'
  ) THEN
    ALTER TABLE "registration_flow_reservations"
      ADD CONSTRAINT "registration_flow_reservations_flow_id_unique" UNIQUE ("flow_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'registration_flow_reservations_flow_id_format_chk'
  ) THEN
    ALTER TABLE "registration_flow_reservations"
      ADD CONSTRAINT "registration_flow_reservations_flow_id_format_chk"
      CHECK ("flow_id" ~ '^[0-9]{6,16}$');
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_flow_reservations_expires_idx"
  ON "registration_flow_reservations" USING btree ("expires_at");
