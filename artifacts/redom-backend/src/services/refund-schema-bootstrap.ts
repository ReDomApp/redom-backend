import { pool } from "../database/db";

export async function ensureRefundSchema(): Promise<void> {
  // Refund routes are allowed to run on databases where the Drizzle refund
  // migration has not been applied yet. Bootstrap the complete refund schema
  // before attempting to seed immutable transaction locks.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS refund_product_policies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_key varchar(120) NOT NULL,
      country_code varchar(2),
      region varchar(60),
      policy_version varchar(40) NOT NULL,
      enabled boolean NOT NULL DEFAULT false,
      policy_document jsonb,
      effective_from timestamptz,
      effective_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (product_key, country_code, region, policy_version)
    );
    CREATE TABLE IF NOT EXISTS refund_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id uuid NOT NULL,
      user_id uuid NOT NULL,
      product_key varchar(120),
      transaction_number varchar(120),
      account_profile_id varchar(64),
      country_code varchar(2),
      currency varchar(10),
      amount numeric(18,2),
      status varchar(40) NOT NULL DEFAULT 'transaction_required',
      review_available_at timestamptz,
      verification_sent_at timestamptz,
      verified_at timestamptz,
      review_started_at timestamptz,
      reviewed_at timestamptz,
      decision varchar(20),
      decision_reason text,
      reviewer_id uuid,
      reviewer_role varchar(60),
      refund_target_type varchar(40),
      refund_target_masked varchar(120),
      refund_expected_by timestamptz,
      refund_completed_at timestamptz,
      case_invalidated_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS refund_requests_case_idx ON refund_requests(case_id);
    CREATE INDEX IF NOT EXISTS refund_requests_user_idx ON refund_requests(user_id);
    CREATE INDEX IF NOT EXISTS refund_requests_transaction_idx ON refund_requests(transaction_number);

    CREATE TABLE IF NOT EXISTS refund_verification_challenges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      refund_request_id uuid NOT NULL,
      user_id uuid NOT NULL,
      channel_type varchar(20) NOT NULL,
      target_masked varchar(120) NOT NULL,
      code_hash varchar(255) NOT NULL,
      expires_at timestamptz NOT NULL,
      attempt_count integer NOT NULL DEFAULT 0,
      max_attempts integer NOT NULL DEFAULT 1,
      consumed_at timestamptz,
      failed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS refund_verification_request_idx ON refund_verification_challenges(refund_request_id);

    CREATE TABLE IF NOT EXISTS refund_reviews (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      refund_request_id uuid NOT NULL,
      reviewer_id uuid,
      reviewer_role varchar(60),
      eligibility_result varchar(30),
      transaction_result varchar(30),
      policy_version varchar(40),
      decision varchar(20),
      decision_reason text,
      internal_notes text,
      started_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS refund_reviews_request_idx ON refund_reviews(refund_request_id);

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

  // Seed the immutable transaction lock from any pre-existing refund request.
  // This intentionally runs only after refund_requests exists.
  await pool.query(`
    INSERT INTO refund_transaction_locks (
      transaction_number, user_id, refund_request_id, case_id, case_number,
      outcome_status, outcome_reason, invalidated_at
    )
    SELECT DISTINCT ON (rr.transaction_number)
      rr.transaction_number, rr.user_id, rr.id, rr.case_id, sc.case_number,
      rr.status, rr.decision_reason, rr.case_invalidated_at
    FROM refund_requests rr
    LEFT JOIN support_cases sc ON sc.id = rr.case_id
    WHERE rr.transaction_number IS NOT NULL
    ORDER BY rr.transaction_number, rr.created_at DESC
    ON CONFLICT (transaction_number) DO NOTHING
  `);
}
