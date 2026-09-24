ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_report_id_format;
ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_report_id_format CHECK (report_id ~ '^[0-9]{10}$');