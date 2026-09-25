import { pool } from "../database/db";

export async function ensureRefundSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS refund_transaction_locks (
      transaction_number varchar(120) PRIMARY KEY,
      user_id uuid NOT NULL,
      refund_request_id uuid,
      case_id uuid,
      case_number varchar(40),
      outcome_status varchar(40) NOT NULL DEFAULT 'requested',
      outcome_reason text,
      refund_id varchar(120),
      locked_at timestamptz NOT NULL DEFAULT now(),
      invalidated_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS refund_transaction_locks_user_idx ON refund_transaction_locks(user_id);
    CREATE INDEX IF NOT EXISTS refund_transaction_locks_status_idx ON refund_transaction_locks(outcome_status);
  `);
}
