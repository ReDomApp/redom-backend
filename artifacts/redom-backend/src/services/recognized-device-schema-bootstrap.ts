import { sql } from "drizzle-orm";
import { db } from "../database/db";

export async function ensureRecognizedDeviceSchema() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS recognized_devices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      credential_hash varchar(128) NOT NULL UNIQUE,
      device_type varchar(30) NOT NULL DEFAULT 'unknown',
      platform varchar(50),
      browser varchar(100),
      device_name varchar(255),
      created_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS recognized_device_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      device_id uuid NOT NULL REFERENCES recognized_devices(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz NOT NULL DEFAULT now(),
      removed_at timestamptz,
      UNIQUE(device_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS recognized_devices_active_credential_idx ON recognized_devices(credential_hash, revoked_at);
    CREATE INDEX IF NOT EXISTS recognized_device_accounts_device_lookup_idx ON recognized_device_accounts(device_id, active);
  `));
}
