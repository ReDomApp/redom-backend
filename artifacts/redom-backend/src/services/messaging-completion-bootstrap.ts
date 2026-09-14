import { pool } from "../database/db";
import { logger } from "../lib/logger";

/** Idempotently verifies the runtime tables required by complete messaging. */
export async function ensureMessagingCompletionSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_message_policies (
      conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
      timer_seconds integer NOT NULL DEFAULT 0 CHECK (timer_seconds IN (0, 86400, 604800, 7776000)),
      updated_by uuid REFERENCES user_profiles(id),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS message_lifecycle (
      message_id uuid PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
      conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      view_once boolean NOT NULL DEFAULT false,
      opened_at timestamptz,
      expires_at timestamptz,
      kept boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS message_lifecycle_conversation_idx ON message_lifecycle(conversation_id, expires_at);
    CREATE INDEX IF NOT EXISTS message_lifecycle_view_once_idx ON message_lifecycle(message_id, view_once);

    CREATE TABLE IF NOT EXISTS call_signals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
      sender_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      signal_type varchar(20) NOT NULL CHECK (signal_type IN ('offer','answer','ice','renegotiate','bye')),
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS call_signals_call_idx ON call_signals(call_id, created_at);

    CREATE TABLE IF NOT EXISTS redom_device_crypto_keys (
      profile_id uuid PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
      public_key text NOT NULL,
      algorithm varchar(60) NOT NULL DEFAULT 'X25519-AES-256-GCM',
      key_version integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE redom_device_crypto_keys ADD COLUMN IF NOT EXISTS device_id uuid DEFAULT gen_random_uuid();
    ALTER TABLE redom_device_crypto_keys ADD COLUMN IF NOT EXISTS device_label varchar(120);
    ALTER TABLE redom_device_crypto_keys ADD COLUMN IF NOT EXISTS platform varchar(40);
    ALTER TABLE redom_device_crypto_keys ADD COLUMN IF NOT EXISTS primary_device boolean NOT NULL DEFAULT false;
    ALTER TABLE redom_device_crypto_keys ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
    ALTER TABLE redom_device_crypto_keys ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
    UPDATE redom_device_crypto_keys SET device_id=gen_random_uuid() WHERE device_id IS NULL;
    ALTER TABLE redom_device_crypto_keys ALTER COLUMN device_id SET NOT NULL;
    ALTER TABLE redom_device_crypto_keys DROP CONSTRAINT IF EXISTS redom_device_crypto_keys_pkey;
    CREATE UNIQUE INDEX IF NOT EXISTS redom_device_crypto_keys_device_pk ON redom_device_crypto_keys(device_id);
    CREATE INDEX IF NOT EXISTS redom_device_crypto_profile_idx ON redom_device_crypto_keys(profile_id, revoked_at);

    ALTER TABLE message_media_envelopes ADD COLUMN IF NOT EXISTS recipient_device_id uuid;
    ALTER TABLE message_media_envelopes DROP CONSTRAINT IF EXISTS message_media_envelopes_device_unique;
    ALTER TABLE message_media_envelopes ADD CONSTRAINT message_media_envelopes_device_unique UNIQUE (message_id, recipient_device_id);

    ALTER TABLE messages ADD COLUMN IF NOT EXISTS encrypted_payload jsonb;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS encryption_version integer;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS encrypted_at timestamptz;

    CREATE OR REPLACE FUNCTION redom_apply_message_lifecycle()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE timer integer;
    BEGIN
      SELECT timer_seconds INTO timer FROM conversation_message_policies WHERE conversation_id = NEW.conversation_id;
      INSERT INTO message_lifecycle(message_id, conversation_id, expires_at)
      VALUES (NEW.id, NEW.conversation_id,
        CASE WHEN COALESCE(timer, 0) > 0 THEN NEW.created_at + make_interval(secs => timer) ELSE NULL END)
      ON CONFLICT (message_id) DO NOTHING;
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS redom_message_lifecycle_trigger ON messages;
    CREATE TRIGGER redom_message_lifecycle_trigger AFTER INSERT ON messages
      FOR EACH ROW EXECUTE FUNCTION redom_apply_message_lifecycle();
  `);
  logger.info("Messaging completion schema verified");
}
