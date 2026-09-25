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

  await pool.query(`
    INSERT INTO refund_transaction_locks (transaction_number, user_id, refund_request_id, case_id, case_number, outcome_status, outcome_reason, invalidated_at)
    SELECT DISTINCT ON (rr.transaction_number)
      rr.transaction_number, rr.user_id, rr.id, rr.case_id, sc.case_number, rr.status, rr.decision_reason, rr.case_invalidated_at
    FROM refund_requests rr
    LEFT JOIN support_cases sc ON sc.id = rr.case_id
    WHERE rr.transaction_number IS NOT NULL
    ORDER BY rr.transaction_number, rr.created_at DESC
    ON CONFLICT (transaction_number) DO NOTHING
  `);
}
