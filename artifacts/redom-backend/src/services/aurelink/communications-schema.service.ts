import { pool } from "../../database/db";

/**
 * Additive schema bootstrap for Aurelink's communications products.
 * These records are tenant-scoped to aurelink_users, never to ReDom users.
 */
export async function ensureAurelinkCommunicationsSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aurelink_communications_workspaces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL DEFAULT 'My workspace',
      status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id)
    );
    CREATE TABLE IF NOT EXISTS aurelink_communications_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      email VARCHAR(320) NOT NULL,
      role VARCHAR(24) NOT NULL CHECK (role IN ('owner','admin','developer','analyst','billing')),
      status VARCHAR(16) NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','revoked')),
      invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(workspace_id,email)
    );
    CREATE TABLE IF NOT EXISTS aurelink_sender_ids (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      channel VARCHAR(12) NOT NULL CHECK (channel IN ('sms','email')),
      sender VARCHAR(320) NOT NULL,
      country_code CHAR(2),
      provider VARCHAR(32) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','approved','rejected','suspended')),
      provider_reference VARCHAR(180),
      rejection_reason TEXT,
      submitted_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_sender_ids_workspace_idx ON aurelink_sender_ids(workspace_id,channel,status);
    CREATE TABLE IF NOT EXISTS aurelink_email_domains (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      domain VARCHAR(253) NOT NULL,
      provider VARCHAR(24) NOT NULL,
      provider_domain_id VARCHAR(180),
      status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verification_pending','verified','failed','disabled')),
      dns_records JSONB NOT NULL DEFAULT '[]'::jsonb,
      last_checked_at TIMESTAMPTZ,
      verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(workspace_id,domain,provider)
    );
    CREATE TABLE IF NOT EXISTS aurelink_email_suppressions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      email VARCHAR(320) NOT NULL,
      reason VARCHAR(32) NOT NULL CHECK (reason IN ('hard_bounce','spam_complaint','unsubscribe','manual')),
      source_provider VARCHAR(24),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(workspace_id,email)
    );
    CREATE TABLE IF NOT EXISTS aurelink_message_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      channel VARCHAR(12) NOT NULL CHECK (channel IN ('sms','email')),
      name VARCHAR(120) NOT NULL,
      subject TEXT,
      body_text TEXT,
      body_html TEXT,
      variables JSONB NOT NULL DEFAULT '[]'::jsonb,
      status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(workspace_id,channel,name)
    );
    CREATE TABLE IF NOT EXISTS aurelink_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      channel VARCHAR(12) NOT NULL CHECK (channel IN ('sms','email')),
      direction VARCHAR(8) NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
      category VARCHAR(24) NOT NULL CHECK (category IN ('transactional','marketing','otp','notification','campaign')),
      provider VARCHAR(24) NOT NULL,
      provider_message_id VARCHAR(220),
      idempotency_key VARCHAR(128),
      recipient TEXT NOT NULL,
      sender TEXT,
      subject TEXT,
      content_hash CHAR(64) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','accepted','sent','delivered','deferred','bounced','failed','rejected','complained','unsubscribed')),
      provider_status TEXT,
      provider_error TEXT,
      segments INTEGER NOT NULL DEFAULT 1 CHECK (segments > 0),
      cost_minor BIGINT,
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      accepted_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(workspace_id,idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS aurelink_messages_workspace_created_idx ON aurelink_messages(workspace_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS aurelink_messages_provider_id_idx ON aurelink_messages(provider,provider_message_id) WHERE provider_message_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS aurelink_messages_status_idx ON aurelink_messages(workspace_id,channel,status,created_at DESC);
    CREATE TABLE IF NOT EXISTS aurelink_verification_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      channel VARCHAR(12) NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms','email')),
      purpose VARCHAR(40) NOT NULL,
      destination TEXT NOT NULL,
      destination_hash CHAR(64) NOT NULL,
      code_hash CHAR(64) NOT NULL,
      verification_salt VARCHAR(64) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','expired','locked','cancelled')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      provider VARCHAR(24) NOT NULL,
      provider_message_id VARCHAR(220),
      expires_at TIMESTAMPTZ NOT NULL,
      verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_verification_due_idx ON aurelink_verification_sessions(workspace_id,status,expires_at);
    CREATE TABLE IF NOT EXISTS aurelink_sms_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      phone_number VARCHAR(32) NOT NULL,
      display_name VARCHAR(120),
      consent_status VARCHAR(16) NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('unknown','opted_in','opted_out')),
      consent_source TEXT,
      consented_at TIMESTAMPTZ,
      opted_out_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(workspace_id,phone_number)
    );
    CREATE TABLE IF NOT EXISTS aurelink_email_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      email VARCHAR(320) NOT NULL,
      display_name VARCHAR(120),
      consent_status VARCHAR(16) NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('unknown','opted_in','opted_out')),
      consent_source TEXT,
      consented_at TIMESTAMPTZ,
      opted_out_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(workspace_id,email)
    );
    CREATE TABLE IF NOT EXISTS aurelink_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      channel VARCHAR(12) NOT NULL CHECK (channel IN ('sms','email')),
      name VARCHAR(140) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','paused','completed','cancelled')),
      subject TEXT,
      content_text TEXT,
      content_html TEXT,
      audience JSONB NOT NULL DEFAULT '{}'::jsonb,
      scheduled_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS aurelink_provider_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider VARCHAR(24) NOT NULL,
      provider_event_id VARCHAR(220),
      provider_message_id VARCHAR(220),
      event_type VARCHAR(64) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(provider,provider_event_id)
    );
    CREATE INDEX IF NOT EXISTS aurelink_provider_events_message_idx ON aurelink_provider_events(provider,provider_message_id);
    CREATE TABLE IF NOT EXISTS aurelink_provider_credentials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      provider VARCHAR(24) NOT NULL,
      credential_type VARCHAR(32) NOT NULL,
      secret_encrypted TEXT NOT NULL,
      secret_prefix VARCHAR(24) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      rotated_at TIMESTAMPTZ
    );
  `);
  await pool.query(`
    ALTER TABLE aurelink_sender_ids ADD COLUMN IF NOT EXISTS request_details JSONB NOT NULL DEFAULT '{}'::jsonb;
    CREATE TABLE IF NOT EXISTS aurelink_dns_provider_connections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      provider VARCHAR(24) NOT NULL CHECK(provider IN ('cloudflare')),
      domain VARCHAR(253) NOT NULL,
      zone_id VARCHAR(64) NOT NULL,
      secret_encrypted TEXT NOT NULL,
      secret_prefix VARCHAR(24) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(workspace_id,provider,domain)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aurelink_smtp_credentials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      username VARCHAR(96) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      label VARCHAR(120) NOT NULL DEFAULT 'SMTP credential',
      status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS aurelink_smtp_credentials_workspace_idx ON aurelink_smtp_credentials(workspace_id,status);
    CREATE TABLE IF NOT EXISTS aurelink_smtp_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      credential_id UUID NOT NULL REFERENCES aurelink_smtp_credentials(id) ON DELETE CASCADE,
      message_key VARCHAR(255) NOT NULL,
      client_message_id VARCHAR(255),
      envelope_from VARCHAR(320) NOT NULL,
      recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
      provider VARCHAR(24) NOT NULL,
      provider_message_id VARCHAR(255),
      status VARCHAR(24) NOT NULL DEFAULT 'accepted' CHECK(status IN ('accepted','delivered','failed')),
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(workspace_id,message_key)
    );
    ALTER TABLE aurelink_smtp_messages ADD COLUMN IF NOT EXISTS client_message_id VARCHAR(255);
    CREATE INDEX IF NOT EXISTS aurelink_smtp_messages_credential_idx ON aurelink_smtp_messages(credential_id,created_at DESC);
  `);
  await pool.query(`CREATE TABLE IF NOT EXISTS aurelink_developer_projects(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500),
    status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id,name)
  )`);
  await pool.query("ALTER TABLE aurelink_communications_workspaces DROP CONSTRAINT IF EXISTS aurelink_communications_workspaces_user_id_key");
  await pool.query("ALTER TABLE aurelink_communications_workspaces ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES aurelink_developer_projects(id) ON DELETE CASCADE");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS aurelink_communications_workspaces_default_user_idx ON aurelink_communications_workspaces(user_id) WHERE project_id IS NULL");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS aurelink_communications_workspaces_project_idx ON aurelink_communications_workspaces(user_id,project_id) WHERE project_id IS NOT NULL");
  await pool.query("ALTER TABLE aurelink_email_domains ADD COLUMN IF NOT EXISTS tracking_settings JSONB NOT NULL DEFAULT '{}'::jsonb");
  await pool.query("ALTER TABLE aurelink_messages DROP CONSTRAINT IF EXISTS aurelink_messages_status_check");
  await pool.query("ALTER TABLE aurelink_messages ADD CONSTRAINT aurelink_messages_status_check CHECK(status IN ('queued','accepted','sent','delivered','deferred','bounced','failed','rejected','complained','unsubscribed','opened','clicked'))");
  await pool.query("ALTER TABLE aurelink_messages ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE aurelink_messages ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE aurelink_messages ADD COLUMN IF NOT EXISTS delivery_latency_ms BIGINT");
  await pool.query("ALTER TABLE aurelink_smtp_messages DROP CONSTRAINT IF EXISTS aurelink_smtp_messages_status_check");
  await pool.query("ALTER TABLE aurelink_smtp_messages ADD CONSTRAINT aurelink_smtp_messages_status_check CHECK(status IN ('accepted','delivered','failed','opened','clicked'))");
  await pool.query("ALTER TABLE aurelink_smtp_messages ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE aurelink_smtp_messages ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE aurelink_messages ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES aurelink_campaigns(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE aurelink_messages ADD COLUMN IF NOT EXISTS verification_session_id UUID REFERENCES aurelink_verification_sessions(id) ON DELETE SET NULL");
  await pool.query("CREATE INDEX IF NOT EXISTS aurelink_messages_verification_idx ON aurelink_messages(verification_session_id) WHERE verification_session_id IS NOT NULL");
  await pool.query("CREATE INDEX IF NOT EXISTS aurelink_messages_campaign_idx ON aurelink_messages(campaign_id,status) WHERE campaign_id IS NOT NULL");
  await pool.query("CREATE INDEX IF NOT EXISTS aurelink_messages_campaign_recipient_idx ON aurelink_messages(campaign_id,recipient,created_at DESC) WHERE campaign_id IS NOT NULL");
  await pool.query("ALTER TABLE aurelink_messages DROP CONSTRAINT IF EXISTS aurelink_messages_status_check");
  await pool.query("ALTER TABLE aurelink_messages ADD CONSTRAINT aurelink_messages_status_check CHECK (status IN ('queued','processing','accepted','sent','delivered','deferred','bounced','failed','rejected','complained','unsubscribed'))");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aurelink_communications_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID NOT NULL UNIQUE REFERENCES aurelink_messages(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      payload_encrypted TEXT NOT NULL,
      payload_hash CHAR(64) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS aurelink_communications_jobs_due_idx ON aurelink_communications_jobs(status,next_attempt_at) WHERE status='pending';
    CREATE TABLE IF NOT EXISTS aurelink_communications_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      message_id UUID NOT NULL UNIQUE REFERENCES aurelink_messages(id) ON DELETE CASCADE,
      channel VARCHAR(12) NOT NULL CHECK(channel IN ('sms','email')),
      provider VARCHAR(24) NOT NULL,
      category VARCHAR(24) NOT NULL,
      units INTEGER NOT NULL DEFAULT 1 CHECK(units>0),
      status VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','accepted','delivered','failed')),
      provider_message_id VARCHAR(220),
      unit_price_minor INTEGER,
      wallet_debit_reference VARCHAR(160),
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE aurelink_communications_usage ADD COLUMN IF NOT EXISTS wallet_debit_reference VARCHAR(160);
    CREATE INDEX IF NOT EXISTS aurelink_communications_usage_workspace_idx ON aurelink_communications_usage(workspace_id,created_at DESC);
  `);
}
