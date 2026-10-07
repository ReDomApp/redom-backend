import { Pool } from "pg";

export async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS redom_mail_messages (
      id TEXT PRIMARY KEY,
      direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
      status TEXT NOT NULL,
      from_address TEXT NOT NULL,
      to_addresses JSONB NOT NULL,
      cc_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
      bcc_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
      reply_to JSONB,
      subject TEXT NOT NULL,
      text_body TEXT,
      html_body TEXT,
      headers JSONB NOT NULL DEFAULT '{}'::jsonb,
      message_id TEXT,
      in_reply_to TEXT,
      references_header TEXT,
      idempotency_key TEXT,
      scheduled_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_error TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS redom_mail_idempotency_idx
      ON redom_mail_messages (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS redom_mail_messages_created_idx
      ON redom_mail_messages (created_at DESC);
    CREATE INDEX IF NOT EXISTS redom_mail_messages_direction_idx
      ON redom_mail_messages (direction, created_at DESC);

    CREATE TABLE IF NOT EXISTS redom_mail_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES redom_mail_messages(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      content_disposition TEXT,
      content_id TEXT,
      size_bytes INTEGER NOT NULL,
      content BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS redom_mail_queue (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES redom_mail_messages(id) ON DELETE CASCADE,
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempts INTEGER NOT NULL DEFAULT 0,
      locked_at TIMESTAMPTZ,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS redom_mail_queue_ready_idx
      ON redom_mail_queue (available_at, attempts);

    CREATE TABLE IF NOT EXISTS redom_mail_events (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES redom_mail_messages(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS redom_mail_events_message_idx
      ON redom_mail_events (message_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS redom_mail_webhooks (
      id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      signing_secret TEXT NOT NULL,
      events JSONB NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS redom_mail_webhook_deliveries (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL REFERENCES redom_mail_webhooks(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL REFERENCES redom_mail_events(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_status_code INTEGER,
      last_error TEXT,
      delivered_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS redom_mail_webhook_ready_idx
      ON redom_mail_webhook_deliveries (next_attempt_at, status);
  `);
}
