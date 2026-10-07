import type { Pool } from "pg";

export async function ensureSchema(pool:Pool):Promise<void>{
 await pool.query(`
 CREATE TABLE IF NOT EXISTS redom_sms_messages(
  id TEXT PRIMARY KEY,client_reference TEXT,idempotency_key TEXT UNIQUE,
  direction TEXT NOT NULL CHECK(direction IN ('outbound','inbound')),
  source TEXT NOT NULL,destination TEXT NOT NULL,body TEXT NOT NULL,
  encoding TEXT NOT NULL,segment_count INTEGER NOT NULL,status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,route_id TEXT,scheduled_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,delivered_at TIMESTAMPTZ,cancelled_at TIMESTAMPTZ
 );
 CREATE INDEX IF NOT EXISTS redom_sms_messages_status_idx ON redom_sms_messages(status,created_at);
 CREATE INDEX IF NOT EXISTS redom_sms_messages_destination_idx ON redom_sms_messages(destination,created_at DESC);
 CREATE INDEX IF NOT EXISTS redom_sms_messages_schedule_idx ON redom_sms_messages(scheduled_at,status);

 CREATE TABLE IF NOT EXISTS redom_sms_segments(
  id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES redom_sms_messages(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,payload BYTEA NOT NULL,provider_message_id TEXT,status TEXT NOT NULL,
  error_code TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),submitted_at TIMESTAMPTZ,delivered_at TIMESTAMPTZ,
  UNIQUE(message_id,segment_index),UNIQUE(provider_message_id)
 );
 CREATE TABLE IF NOT EXISTS redom_sms_receipts(
  id BIGSERIAL PRIMARY KEY,segment_id TEXT REFERENCES redom_sms_segments(id) ON DELETE SET NULL,
  provider_message_id TEXT,status TEXT NOT NULL,error_code TEXT,raw TEXT,received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS redom_sms_routes(
  id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,countries TEXT[] NOT NULL DEFAULT '{}',
  sender_types TEXT[] NOT NULL DEFAULT '{}',transport TEXT NOT NULL,config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS redom_sms_queue(
  message_id TEXT PRIMARY KEY REFERENCES redom_sms_messages(id) ON DELETE CASCADE,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),locked_at TIMESTAMPTZ,locked_by TEXT,attempts INTEGER NOT NULL DEFAULT 0
 );
 CREATE TABLE IF NOT EXISTS redom_sms_webhooks(
  id TEXT PRIMARY KEY,url TEXT NOT NULL,secret TEXT NOT NULL,events TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS redom_sms_webhook_events(
  id BIGSERIAL PRIMARY KEY,webhook_id TEXT REFERENCES redom_sms_webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,payload JSONB NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,
  delivered_at TIMESTAMPTZ,last_error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS redom_sms_optouts(
  phone_number TEXT PRIMARY KEY,source TEXT NOT NULL DEFAULT 'user',keyword TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS redom_sms_rate_limits(
  bucket TEXT PRIMARY KEY,count INTEGER NOT NULL DEFAULT 0,window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 `);
}