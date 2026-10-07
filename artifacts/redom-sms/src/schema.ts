import type { Pool } from "pg";

export async function ensureSchema(pool:Pool):Promise<void>{
  await pool.query(`
    CREATE TABLE IF NOT EXISTS redom_sms_messages (
      id TEXT PRIMARY KEY,
      client_reference TEXT,
      idempotency_key TEXT UNIQUE,
      direction TEXT NOT NULL CHECK(direction IN ('outbound','inbound')),
      source TEXT NOT NULL,
      destination TEXT NOT NULL,
      body TEXT NOT NULL,
      encoding TEXT NOT NULL,
      segment_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS redom_sms_messages_status_idx ON redom_sms_messages(status, created_at);
    CREATE INDEX IF NOT EXISTS redom_sms_messages_destination_idx ON redom_sms_messages(destination, created_at DESC);

    CREATE TABLE IF NOT EXISTS redom_sms_segments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES redom_sms_messages(id) ON DELETE CASCADE,
      segment_index INTEGER NOT NULL,
      payload BYTEA NOT NULL,
      provider_message_id TEXT,
      status TEXT NOT NULL,
      error_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      UNIQUE(message_id, segment_index)
    );

    CREATE TABLE IF NOT EXISTS redom_sms_receipts (
      id BIGSERIAL PRIMARY KEY,
      segment_id TEXT REFERENCES redom_sms_segments(id) ON DELETE SET NULL,
      provider_message_id TEXT,
      status TEXT NOT NULL,
      error_code TEXT,
      raw TEXT,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS redom_sms_routes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      priority INTEGER NOT NULL DEFAULT 100,
      countries TEXT[] NOT NULL DEFAULT '{}',
      transport TEXT NOT NULL,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS redom_sms_queue (
      message_id TEXT PRIMARY KEY REFERENCES redom_sms_messages(id) ON DELETE CASCADE,
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_at TIMESTAMPTZ,
      locked_by TEXT,
      attempts INTEGER NOT NULL DEFAULT 0
    );
  `);
}
