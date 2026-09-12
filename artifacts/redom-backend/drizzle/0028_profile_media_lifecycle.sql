ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS profile_photo_previous varchar(500),
  ADD COLUMN IF NOT EXISTS profile_photo_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS user_profiles_profile_photo_expires_idx
  ON user_profiles(profile_photo_expires_at)
  WHERE profile_photo_expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS profile_media_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind varchar(20) NOT NULL CHECK (kind IN ('profile', 'cover')),
  object_key text NOT NULL,
  previous_object_key text,
  share_id varchar(10) NOT NULL,
  caption text,
  temporary_until timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_media_history_user_created_idx
  ON profile_media_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS profile_media_history_expiry_idx
  ON profile_media_history (temporary_until)
  WHERE temporary_until IS NOT NULL AND archived_at IS NULL;
