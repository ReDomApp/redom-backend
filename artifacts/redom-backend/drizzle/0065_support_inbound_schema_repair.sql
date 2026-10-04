ALTER TABLE support_inbound_events
  ADD COLUMN IF NOT EXISTS status varchar(16) NOT NULL DEFAULT 'processed',
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error varchar(1000);

ALTER TABLE support_inbound_events
  DROP CONSTRAINT IF EXISTS support_inbound_events_status_check;

ALTER TABLE support_inbound_events
  ADD CONSTRAINT support_inbound_events_status_check
  CHECK (status IN ('processing', 'processed', 'failed'));

CREATE INDEX IF NOT EXISTS support_inbound_events_processing_idx
  ON support_inbound_events(status, processing_started_at);
