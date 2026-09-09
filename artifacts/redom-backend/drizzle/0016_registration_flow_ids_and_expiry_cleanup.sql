ALTER TABLE "registration_challenges"
  ADD COLUMN "flow_id" varchar(16);
--> statement-breakpoint
UPDATE "registration_challenges"
SET "flow_id" = lpad(
  mod(
    abs((('x' || encode(gen_random_bytes(8), 'hex'))::bit(64)::bigint)),
    10000000000000000
  )::text,
  16,
  '0'
)
WHERE "flow_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "registration_challenges"
  ALTER COLUMN "flow_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "registration_challenges"
  ADD CONSTRAINT "registration_challenges_flow_id_format_chk"
  CHECK ("flow_id" ~ '^[0-9]{6,16}$');
--> statement-breakpoint
CREATE INDEX "registration_challenges_flow_id_idx"
  ON "registration_challenges" USING btree ("flow_id");
--> statement-breakpoint
CREATE INDEX "registration_challenges_active_flow_id_idx"
  ON "registration_challenges" USING btree ("flow_id", "status", "expires_at");
