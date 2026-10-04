import type { Pool } from "pg";

const SUPPORT_INBOUND_SCHEMA_SQL = [
  `ALTER TABLE support_inbound_events
     ADD COLUMN IF NOT EXISTS status varchar(16) NOT NULL DEFAULT 'processed'`,
  `ALTER TABLE support_inbound_events
     ADD COLUMN IF NOT EXISTS processing_started_at timestamptz`,
  `ALTER TABLE support_inbound_events
     ADD COLUMN IF NOT EXISTS processed_at timestamptz`,
  `ALTER TABLE support_inbound_events
     ADD COLUMN IF NOT EXISTS last_error varchar(1000)`,
  `CREATE INDEX IF NOT EXISTS support_inbound_events_processing_idx
     ON support_inbound_events(status, processing_started_at)`,
];

let repairPromise: Promise<void> | null = null;

export function ensureSupportInboundSchema(pool: Pool): Promise<void> {
  if (!repairPromise) {
    repairPromise = (async () => {
      for (const sql of SUPPORT_INBOUND_SCHEMA_SQL) {
        await pool.query(sql);
      }

      await pool.query(`
        ALTER TABLE support_inbound_events
          DROP CONSTRAINT IF EXISTS support_inbound_events_status_check
      `);

      await pool.query(`
        ALTER TABLE support_inbound_events
          ADD CONSTRAINT support_inbound_events_status_check
          CHECK (status IN ('processing', 'processed', 'failed'))
      `);

      console.log("Support inbound-event schema verified.");
    })().catch((error) => {
      repairPromise = null;
      console.error("Support inbound-event schema repair failed:", error);
      throw error;
    });
  }

  return repairPromise;
}
