import { pool } from "../database/db";

export async function ensureBugReportSchema(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS bug_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id varchar(11) NOT NULL UNIQUE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    product varchar(80) NOT NULL,
    category varchar(80) NOT NULL,
    description text NOT NULL,
    fix_required text NOT NULL,
    include_diagnostics boolean NOT NULL DEFAULT false,
    diagnostics jsonb,
    status varchar(32) NOT NULL DEFAULT 'submitted',
    email_from varchar(255) NOT NULL,
    email_status varchar(32) NOT NULL DEFAULT 'pending',
    submitted_at timestamptz NOT NULL DEFAULT now(),
    emailed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT bug_reports_report_id_format CHECK (report_id ~ '^[0-9]{10}$'),
    CONSTRAINT bug_reports_status_check CHECK (status IN ('submitted','processing','emailed','email_failed')),
    CONSTRAINT bug_reports_email_status_check CHECK (email_status IN ('pending','sent','failed'))
  `);
  await pool.query(`CREATE TABLE IF NOT EXISTS bug_report_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id uuid NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
    storage_key varchar(500) NOT NULL,
    filename varchar(255) NOT NULL,
    content_type varchar(100) NOT NULL,
    byte_size integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT bug_report_attachments_size_check CHECK (byte_size > 0 AND byte_size <= 10485760)
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS bug_reports_user_idx ON bug_reports(user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS bug_reports_status_idx ON bug_reports(status, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS bug_report_attachments_report_idx ON bug_report_attachments(report_id, created_at ASC)`);
}
