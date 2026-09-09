ALTER TABLE "registration_challenges"
  ADD COLUMN IF NOT EXISTS "flow_id" varchar(16);
--> statement-breakpoint
DO $$
DECLARE
  challenge_record RECORD;
  candidate text;
BEGIN
  FOR challenge_record IN
    SELECT "id"
    FROM "registration_challenges"
    WHERE "flow_id" IS NULL
  LOOP
    LOOP
      candidate := substr(translate(md5(challenge_record."id"::text || clock_timestamp()::text || random()::text), 'abcdef', '012345'), 1, 16);
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM "registration_challenges" AS existing
        WHERE existing."flow_id" = candidate
      );
    END LOOP;

    UPDATE "registration_challenges"
    SET "flow_id" = candidate
    WHERE "id" = challenge_record."id";
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "registration_challenges"
  ALTER COLUMN "flow_id" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'registration_challenges_flow_id_format_chk'
  ) THEN
    ALTER TABLE "registration_challenges"
      ADD CONSTRAINT "registration_challenges_flow_id_format_chk"
      CHECK ("flow_id" ~ '^[0-9]{6,16}$');
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_challenges_flow_id_idx"
  ON "registration_challenges" USING btree ("flow_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_challenges_active_flow_id_idx"
  ON "registration_challenges" USING btree ("flow_id", "status", "expires_at");
