import type { Pool } from "pg";

export async function ensureRedomOAuthSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS redom_oauth_authorization_requests (
      id uuid PRIMARY KEY,
      client_id text NOT NULL,
      redirect_uri text NOT NULL,
      code_challenge text NOT NULL,
      code_challenge_method text NOT NULL DEFAULT 'S256',
      scope text NOT NULL,
      state text,
      resource text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      approved_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS redom_oauth_authorization_requests_expires_idx
      ON redom_oauth_authorization_requests (expires_at);

    CREATE TABLE IF NOT EXISTS redom_oauth_codes (
      code_hash text PRIMARY KEY,
      request_id uuid NOT NULL REFERENCES redom_oauth_authorization_requests(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id text NOT NULL,
      redirect_uri text NOT NULL,
      code_challenge text NOT NULL,
      scope text NOT NULL,
      resource text NOT NULL,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS redom_oauth_codes_expires_idx
      ON redom_oauth_codes (expires_at);

    CREATE TABLE IF NOT EXISTS redom_oauth_consents (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id text NOT NULL,
      scope text NOT NULL,
      granted_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz,
      PRIMARY KEY (user_id, client_id)
    );

    CREATE TABLE IF NOT EXISTS redom_oauth_tokens (
      jti uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id text NOT NULL,
      scope text NOT NULL,
      resource text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS redom_oauth_tokens_user_idx
      ON redom_oauth_tokens (user_id, client_id);
  `);
}
