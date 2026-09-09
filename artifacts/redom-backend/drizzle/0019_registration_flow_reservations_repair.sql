CREATE TABLE IF NOT EXISTS "registration_flow_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "flow_id" varchar(16),
  "device_id" varchar(255),
  "first_name" varchar(100),
  "last_name" varchar(100),
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
