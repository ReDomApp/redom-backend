import { pool } from "../database/db";
import { logger } from "../lib/logger";

/**
 * Idempotent messaging capability bootstrap.
 *
 * This is deliberately separate from Drizzle's generated migration history:
 * Render starts the API directly, so the messaging runtime must be able to
 * safely add the small lifecycle tables it needs on an already-running Neon DB.
 */
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

    CREATE INDEX IF NOT EXISTS message_lifecycle_conversation_idx
      ON message_lifecycle(conversation_id, expires_at);

    CREATE INDEX IF NOT EXISTS message_lifecycle_view_once_idx
      ON message_lifecycle(message_id, view_once);

    CREATE OR REPLACE FUNCTION redom_apply_message_lifecycle()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE timer integer;
    BEGIN
      SELECT timer_seconds INTO timer
      FROM conversation_message_policies
      WHERE conversation_id = NEW.conversation_id;

      INSERT INTO message_lifecycle(message_id, conversation_id, expires_at)
      VALUES (
        NEW.id,
        NEW.conversation_id,
        CASE
          WHEN COALESCE(timer, 0) > 0 THEN NEW.created_at + make_interval(secs => timer)
          ELSE NULL
        END
      )
      ON CONFLICT (message_id) DO NOTHING;
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS redom_message_lifecycle_trigger ON messages;
    CREATE TRIGGER redom_message_lifecycle_trigger
      AFTER INSERT ON messages
      FOR EACH ROW EXECUTE FUNCTION redom_apply_message_lifecycle();
  `);

  logger.info("Messaging completion schema verified");
}
