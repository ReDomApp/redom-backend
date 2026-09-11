ALTER TABLE "login_history" ADD COLUMN IF NOT EXISTS "flow_id" varchar(16);
CREATE INDEX IF NOT EXISTS "login_history_flow_id_idx" ON "login_history" ("flow_id");
