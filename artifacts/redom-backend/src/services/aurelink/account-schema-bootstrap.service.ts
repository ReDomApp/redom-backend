import type { Pool } from "pg";

/**
 * Aurelink's customer identity is independent from ReDom's canonical users.
 * This schema intentionally lives in the existing backend database and uses
 * the backend's existing DATABASE_URL / pool and shared provider credentials.
 *
 * Keep all customer-facing Aurelink security records keyed to aurelink_users.
 */
export async function ensureAurelinkAccountSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aurelink_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id VARCHAR(16) UNIQUE,
      first_name VARCHAR(100) NOT NULL DEFAULT '',
      last_name VARCHAR(100) NOT NULL DEFAULT '',
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      phone_number VARCHAR(20),
      phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
      account_status VARCHAR(24) NOT NULL DEFAULT 'pending'
        CHECK (account_status IN ('pending','active','suspended','banned','deleted')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );
    ALTER TABLE aurelink_users ADD COLUMN IF NOT EXISTS account_id VARCHAR(16) UNIQUE;
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_users_email_unique
      ON aurelink_users (LOWER(email));
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_users_phone_unique
      ON aurelink_users (phone_number) WHERE phone_number IS NOT NULL;

    CREATE TABLE IF NOT EXISTS aurelink_account_security (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES aurelink_users(id) ON DELETE CASCADE,
      two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      two_factor_method VARCHAR(20) NOT NULL DEFAULT 'off'
        CHECK (two_factor_method IN ('off','authenticator','email','phone')),
      totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      totp_secret_encrypted TEXT,
      totp_algorithm VARCHAR(10) NOT NULL DEFAULT 'SHA1',
      totp_digits SMALLINT NOT NULL DEFAULT 6 CHECK (totp_digits IN (6,8)),
      totp_period SMALLINT NOT NULL DEFAULT 30 CHECK (totp_period BETWEEN 15 AND 120),
      totp_confirmed_at TIMESTAMPTZ,
      totp_last_used_step BIGINT,
      totp_setup_secret_encrypted TEXT,
      totp_setup_expires_at TIMESTAMPTZ,
      recovery_codes_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
      recovery_codes_generated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (
        (two_factor_enabled = FALSE AND two_factor_method = 'off')
        OR (two_factor_enabled = TRUE AND two_factor_method IN ('authenticator','email','phone'))
      ),
      CHECK (
        (totp_enabled = FALSE AND two_factor_method <> 'authenticator')
        OR (totp_enabled = TRUE AND two_factor_enabled = TRUE
            AND two_factor_method = 'authenticator' AND totp_secret_encrypted IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS aurelink_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      refresh_token_hash VARCHAR(255) NOT NULL,
      device_id VARCHAR(255),
      device_name VARCHAR(255),
      platform VARCHAR(100),
      browser VARCHAR(100),
      user_agent VARCHAR(1000),
      ip_address VARCHAR(45),
      country VARCHAR(100),
      region VARCHAR(100),
      city VARCHAR(100),
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_sessions_user_idx
      ON aurelink_sessions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS aurelink_sessions_active_idx
      ON aurelink_sessions(user_id, expires_at) WHERE revoked_at IS NULL;

    CREATE TABLE IF NOT EXISTS aurelink_verifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES aurelink_users(id) ON DELETE CASCADE,
      type VARCHAR(30) NOT NULL,
      purpose VARCHAR(50) NOT NULL,
      target VARCHAR(255) NOT NULL,
      normalized_target VARCHAR(255) NOT NULL,
      channel VARCHAR(20) NOT NULL CHECK (channel IN ('email','sms','authenticator')),
      requested_length SMALLINT NOT NULL DEFAULT 6,
      code_length SMALLINT NOT NULL DEFAULT 6,
      code_hash VARCHAR(64) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','verified','consumed','expired','locked','cancelled')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      provider VARCHAR(50),
      provider_reference VARCHAR(255),
      request_ip VARCHAR(100),
      user_agent VARCHAR(1000),
      device_id VARCHAR(255),
      session_id UUID,
      expires_at TIMESTAMPTZ NOT NULL,
      verified_at TIMESTAMPTZ,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_verifications_user_idx ON aurelink_verifications(user_id);
    CREATE INDEX IF NOT EXISTS aurelink_verifications_target_idx ON aurelink_verifications(normalized_target);
    CREATE INDEX IF NOT EXISTS aurelink_verifications_status_expiry_idx ON aurelink_verifications(status, expires_at);

    CREATE TABLE IF NOT EXISTS aurelink_login_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      session_id UUID REFERENCES aurelink_sessions(id) ON DELETE SET NULL,
      event_type VARCHAR(40) NOT NULL DEFAULT 'login',
      success BOOLEAN NOT NULL DEFAULT TRUE,
      ip_address VARCHAR(45),
      country VARCHAR(100),
      region VARCHAR(100),
      city VARCHAR(100),
      device_name VARCHAR(255),
      device_type VARCHAR(50),
      platform VARCHAR(100),
      browser VARCHAR(100),
      user_agent VARCHAR(1000),
      failure_reason VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_login_history_user_idx
      ON aurelink_login_history(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS aurelink_recognized_devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      credential_hash VARCHAR(64) NOT NULL,
      device_id VARCHAR(255),
      device_name VARCHAR(255),
      device_type VARCHAR(50),
      platform VARCHAR(100),
      browser VARCHAR(100),
      last_ip_address VARCHAR(45),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, credential_hash)
    );
    CREATE INDEX IF NOT EXISTS aurelink_recognized_devices_user_idx
      ON aurelink_recognized_devices(user_id) WHERE revoked_at IS NULL;

    CREATE TABLE IF NOT EXISTS aurelink_password_resets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      request_ip VARCHAR(45),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_password_resets_user_idx
      ON aurelink_password_resets(user_id, expires_at);

    CREATE TABLE IF NOT EXISTS aurelink_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES aurelink_users(id) ON DELETE SET NULL,
      event_type VARCHAR(80) NOT NULL,
      actor_type VARCHAR(30) NOT NULL DEFAULT 'user',
      actor_id VARCHAR(255),
      ip_address VARCHAR(45),
      user_agent VARCHAR(1000),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_audit_logs_user_idx
      ON aurelink_audit_logs(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS aurelink_signup_email_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      request_ip VARCHAR(45) NOT NULL,
      country VARCHAR(100),
      region VARCHAR(100),
      city VARCHAR(100),
      timezone VARCHAR(100),
      network_type VARCHAR(80),
      expires_at TIMESTAMPTZ NOT NULL,
      verified_at TIMESTAMPTZ,
      consumed_at TIMESTAMPTZ,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_signup_email_tokens_email_idx
      ON aurelink_signup_email_tokens(LOWER(email), created_at DESC);
  `);
  await pool.query(`
    ALTER TABLE aurelink_account_security ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS aurelink_name_change_codes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,code_hash CHAR(64) NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,expires_at TIMESTAMPTZ NOT NULL,consumed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS aurelink_name_codes_user_idx ON aurelink_name_change_codes(user_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS aurelink_profile_security (user_id UUID PRIMARY KEY REFERENCES aurelink_users(id) ON DELETE CASCADE,last_changed_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS aurelink_api_keys (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,label VARCHAR(60) NOT NULL,key_hash CHAR(64) NOT NULL UNIQUE,key_prefix VARCHAR(16) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_used_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS aurelink_totp_login_challenges (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,device_id VARCHAR(255),ip_address VARCHAR(45),expires_at TIMESTAMPTZ NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,consumed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS aurelink_ip_allowlists (user_id UUID PRIMARY KEY REFERENCES aurelink_users(id) ON DELETE CASCADE,enabled BOOLEAN NOT NULL DEFAULT FALSE,entries JSONB NOT NULL DEFAULT '[]'::jsonb,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS aurelink_security_email_codes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,purpose VARCHAR(50) NOT NULL,code_hash CHAR(64) NOT NULL,expires_at TIMESTAMPTZ NOT NULL,consumed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  `);
}