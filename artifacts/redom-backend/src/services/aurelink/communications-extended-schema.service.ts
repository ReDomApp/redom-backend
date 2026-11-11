import { pool } from "../../database/db";

/**
 * Additive schema for Aurelink's developer communications platform.
 * This bootstrap is intentionally idempotent and does not create inbound-mail
 * infrastructure. It only extends outbound usage billing, reputation and teams.
 */
export async function ensureAurelinkCommunicationsExtendedSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE aurelink_email_domains
      ADD COLUMN IF NOT EXISTS tracking_domain VARCHAR(253),
      ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
    ALTER TABLE aurelink_email_domains DROP CONSTRAINT IF EXISTS aurelink_email_domains_status_check;
    ALTER TABLE aurelink_email_domains ADD CONSTRAINT aurelink_email_domains_status_check
      CHECK (status IN ('pending','verification_pending','verified','failed','disabled','suspended','deleting','deleted'));

    ALTER TABLE aurelink_communications_members
      ADD COLUMN IF NOT EXISTS invitation_token_hash CHAR(64),
      ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS accepted_user_id UUID REFERENCES aurelink_users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES aurelink_users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_communications_member_invite_token_idx
      ON aurelink_communications_members(invitation_token_hash) WHERE invitation_token_hash IS NOT NULL;

    CREATE TABLE IF NOT EXISTS aurelink_communications_price_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      service VARCHAR(32) NOT NULL CHECK (service IN ('sms_segment','email_message','smtp_message')),
      country_code CHAR(2) NOT NULL DEFAULT '*',
      provider VARCHAR(24) NOT NULL DEFAULT '*',
      category VARCHAR(24) NOT NULL DEFAULT '*',
      unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor > 0),
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      effective_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_communications_price_lookup_idx
      ON aurelink_communications_price_catalog(service,country_code,provider,category,active,effective_from DESC);

    CREATE TABLE IF NOT EXISTS aurelink_communications_billing_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      message_id UUID NOT NULL REFERENCES aurelink_messages(id) ON DELETE CASCADE,
      entry_type VARCHAR(12) NOT NULL CHECK(entry_type IN ('charge','refund')),
      status VARCHAR(16) NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','posted','refunded')),
      price_id UUID REFERENCES aurelink_communications_price_catalog(id) ON DELETE SET NULL,
      units INTEGER NOT NULL CHECK(units > 0),
      unit_price_minor INTEGER NOT NULL CHECK(unit_price_minor > 0),
      amount_minor BIGINT NOT NULL CHECK(amount_minor > 0),
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      wallet_reference VARCHAR(120) NOT NULL UNIQUE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(message_id,entry_type)
    );
    CREATE INDEX IF NOT EXISTS aurelink_communications_billing_user_time_idx
      ON aurelink_communications_billing_ledger(user_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS aurelink_communications_billing_workspace_time_idx
      ON aurelink_communications_billing_ledger(workspace_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS aurelink_communications_reputation (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      domain VARCHAR(253),
      score SMALLINT NOT NULL CHECK(score BETWEEN 0 AND 100),
      level VARCHAR(16) NOT NULL CHECK(level IN ('healthy','watch','poor','critical','insufficient_data')),
      sample_size INTEGER NOT NULL DEFAULT 0,
      delivered_count INTEGER NOT NULL DEFAULT 0,
      bounced_count INTEGER NOT NULL DEFAULT 0,
      complained_count INTEGER NOT NULL DEFAULT 0,
      deferred_count INTEGER NOT NULL DEFAULT 0,
      bounce_rate NUMERIC(8,5) NOT NULL DEFAULT 0,
      complaint_rate NUMERIC(8,5) NOT NULL DEFAULT 0,
      delivery_rate NUMERIC(8,5) NOT NULL DEFAULT 0,
      metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
      calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_communications_reputation_latest_idx
      ON aurelink_communications_reputation(workspace_id,domain,calculated_at DESC);

    CREATE TABLE IF NOT EXISTS aurelink_communications_reputation_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      domain VARCHAR(253),
      alert_key VARCHAR(80) NOT NULL,
      severity VARCHAR(16) NOT NULL CHECK(severity IN ('warning','critical')),
      title VARCHAR(180) NOT NULL,
      description TEXT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved')),
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      UNIQUE(workspace_id,domain,alert_key,status)
    );
    CREATE INDEX IF NOT EXISTS aurelink_communications_reputation_alerts_idx
      ON aurelink_communications_reputation_alerts(workspace_id,status,last_seen_at DESC);
  `);
}
