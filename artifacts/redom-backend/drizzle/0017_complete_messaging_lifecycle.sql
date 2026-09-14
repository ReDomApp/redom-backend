CREATE TABLE IF NOT EXISTS "conversation_message_policies" (
  "conversation_id" uuid PRIMARY KEY REFERENCES "conversations"("id") ON DELETE CASCADE,
  "timer_seconds" integer NOT NULL DEFAULT 0 CHECK ("timer_seconds" IN (0, 86400, 604800, 7776000)),
  "updated_by" uuid REFERENCES "user_profiles"("id"),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "message_lifecycle" (
  "message_id" uuid PRIMARY KEY REFERENCES "messages"("id") ON DELETE CASCADE,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "view_once" boolean NOT NULL DEFAULT false,
  "opened_at" timestamptz,
  "expires_at" timestamptz,
  "kept" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "message_lifecycle_conversation_idx" ON "message_lifecycle"("conversation_id", "expires_at");
CREATE INDEX IF NOT EXISTS "message_lifecycle_view_once_idx" ON "message_lifecycle"("message_id", "view_once");

CREATE TABLE IF NOT EXISTS "call_signals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "call_id" uuid NOT NULL REFERENCES "calls"("id") ON DELETE CASCADE,
  "sender_id" uuid NOT NULL REFERENCES "user_profiles"("id") ON DELETE CASCADE,
  "signal_type" varchar(20) NOT NULL CHECK ("signal_type" IN ('offer','answer','ice','renegotiate','bye')),
  "payload" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "call_signals_call_idx" ON "call_signals"("call_id", "created_at");
