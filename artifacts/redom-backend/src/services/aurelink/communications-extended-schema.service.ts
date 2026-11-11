import { pool } from "../../database/db";

/**
 * Additive schema for Aurelink's developer communications platform.
 * This bootstrap is intentionally idempotent and does not create inbound-mail
 * infrastructure. It only extends outbound usage billing, reputation and teams.
 */
export async function ensureAurelinkCommunicationsExtendedSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE aurelink_sender_ids
      ADD COLUMN IF NOT EXISTS registration_state VARCHAR(32) NOT NULL DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS security_review_status VARCHAR(24) NOT NULL DEFAULT 'not_started',
      ADD COLUMN IF NOT EXISTS security_reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS security_reviewed_by UUID REFERENCES aurelink_users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS website_domain VARCHAR(253),
      ADD COLUMN IF NOT EXISTS website_verification_id UUID,
      ADD COLUMN IF NOT EXISTS submitted_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS evidence_fingerprint CHAR(64),
      ADD COLUMN IF NOT EXISTS consent_evidence_reference TEXT,
      ADD COLUMN IF NOT EXISTS business_address TEXT,
      ADD COLUMN IF NOT EXISTS business_contact JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS monthly_volume BIGINT,
      ADD COLUMN IF NOT EXISTS sms_purpose VARCHAR(24),
      ADD COLUMN IF NOT EXISTS sender_type VARCHAR(32) NOT NULL DEFAULT 'alphanumeric',
      ADD COLUMN IF NOT EXISTS last_security_reason TEXT;
    ALTER TABLE aurelink_sender_ids DROP CONSTRAINT IF EXISTS aurelink_sender_ids_registration_state_check;
    ALTER TABLE aurelink_sender_ids ADD CONSTRAINT aurelink_sender_ids_registration_state_check
      CHECK (registration_state IN ('draft','verification_required','security_review','ready_for_submission','submitted','approved','rejected','suspended'));
    ALTER TABLE aurelink_sender_ids DROP CONSTRAINT IF EXISTS aurelink_sender_ids_security_review_status_check;
    ALTER TABLE aurelink_sender_ids ADD CONSTRAINT aurelink_sender_ids_security_review_status_check
      CHECK (security_review_status IN ('not_started','pending','passed','failed','manual_review'));
    CREATE INDEX IF NOT EXISTS aurelink_sender_ids_security_gate_idx
      ON aurelink_sender_ids(workspace_id,country_code,registration_state,security_review_status);
    CREATE TABLE IF NOT EXISTS aurelink_sender_security_restrictions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      sender_application_id UUID REFERENCES aurelink_sender_ids(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','revoked')),
      created_by UUID REFERENCES aurelink_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK(ends_at > starts_at)
    );
    CREATE INDEX IF NOT EXISTS aurelink_sender_security_restrictions_active_idx
      ON aurelink_sender_security_restrictions(user_id,workspace_id,status,ends_at);
    CREATE TABLE IF NOT EXISTS aurelink_verified_websites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE,
      domain VARCHAR(253) NOT NULL,
      website_url TEXT NOT NULL,
      verification_method VARCHAR(32) NOT NULL CHECK (verification_method IN ('dns_txt','https_file','admin_attestation')),
      verification_token_hash CHAR(64),
      status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','failed','revoked')),
      verified_at TIMESTAMPTZ,
      verified_by UUID REFERENCES aurelink_users(id) ON DELETE SET NULL,
      evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(workspace_id,domain)
    );
    CREATE INDEX IF NOT EXISTS aurelink_verified_websites_lookup_idx
      ON aurelink_verified_websites(workspace_id,domain,status);

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
    ALTER TABLE aurelink_communications_price_catalog ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES aurelink_communications_workspaces(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS aurelink_communications_price_lookup_idx
      ON aurelink_communications_price_catalog(workspace_id,service,country_code,provider,category,active,effective_from DESC);

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
