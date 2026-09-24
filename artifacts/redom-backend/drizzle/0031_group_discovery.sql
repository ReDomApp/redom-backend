ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "group_visibility" varchar(20) DEFAULT 'private' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_group_discovery_idx" ON "conversations" ("conversation_type","group_visibility","status","deleted");