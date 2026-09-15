ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "anyone_can_send_messages" boolean NOT NULL DEFAULT true;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "anyone_can_send_history" boolean NOT NULL DEFAULT true;
ALTER TABLE "conversation_participants" ADD COLUMN IF NOT EXISTS "member_tag" varchar(80);

CREATE TABLE IF NOT EXISTS "group_invite_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "token" varchar(128) NOT NULL,
  "created_by" uuid NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "reset_at" timestamp with time zone,
  CONSTRAINT "group_invite_links_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade,
  CONSTRAINT "group_invite_links_created_by_user_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "user_profiles"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "group_invite_links_token_unique" ON "group_invite_links" USING btree ("token");
CREATE INDEX IF NOT EXISTS "group_invite_links_conversation_active_idx" ON "group_invite_links" USING btree ("conversation_id", "active");