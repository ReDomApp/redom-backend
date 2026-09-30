ALTER TABLE support_inbound_events
  ADD COLUMN IF NOT EXISTS status varchar(16) NOT NULL DEFAULT 'processed',
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error varchar(1000);

UPDATE support_inbound_events
   SET status = 'processed',
       processed_at = COALESCE(processed_at, created_at),
       processing_started_at = NULL
 WHERE status IS NULL OR status NOT IN ('processing', 'processed', 'failed');

DELETE FROM support_inbound_events a
USING support_inbound_events b
WHERE a.email_id = b.email_id
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS support_inbound_events_email_id_idx
  ON support_inbound_events(email_id);

CREATE INDEX IF NOT EXISTS support_inbound_events_processing_idx
  ON support_inbound_events(status, processing_started_at);

ALTER TABLE support_inbound_events
  DROP CONSTRAINT IF EXISTS support_inbound_events_status_check;

ALTER TABLE support_inbound_events
  ADD CONSTRAINT support_inbound_events_status_check
  CHECK (status IN ('processing', 'processed', 'failed'));
