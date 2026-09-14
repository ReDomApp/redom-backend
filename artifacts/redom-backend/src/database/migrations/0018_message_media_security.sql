ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS encrypted boolean NOT NULL DEFAULT false;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS encryption_version integer;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS view_once boolean NOT NULL DEFAULT false;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS view_once_opened boolean NOT NULL DEFAULT false;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS view_once_opened_at timestamptz;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS view_once_expires_at timestamptz;
CREATE TABLE IF NOT EXISTS message_media_envelopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id),
  recipient_profile_id uuid NOT NULL REFERENCES user_profiles(id),
  recipient_device_id uuid,
  version integer NOT NULL DEFAULT 1,
  algorithm text NOT NULL DEFAULT 'X25519-AES-256-GCM',
  ephemeral_public_key text NOT NULL,
  encrypted_media_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE message_media_envelopes ADD COLUMN IF NOT EXISTS recipient_device_id uuid;
ALTER TABLE message_media_envelopes DROP CONSTRAINT IF EXISTS message_media_envelopes_message_id_recipient_profile_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS message_media_envelopes_message_device_uq ON message_media_envelopes(message_id, recipient_device_id) WHERE recipient_device_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS message_media_envelopes_message_profile_legacy_uq ON message_media_envelopes(message_id, recipient_profile_id) WHERE recipient_device_id IS NULL;
CREATE INDEX IF NOT EXISTS message_media_envelopes_message_idx ON message_media_envelopes(message_id);
CREATE INDEX IF NOT EXISTS message_media_envelopes_recipient_idx ON message_media_envelopes(recipient_profile_id);
CREATE INDEX IF NOT EXISTS message_media_envelopes_device_idx ON message_media_envelopes(recipient_device_id);
