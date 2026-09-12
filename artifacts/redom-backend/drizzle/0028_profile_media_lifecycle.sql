ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS profile_photo_previous varchar(500),
  ADD COLUMN IF NOT EXISTS profile_photo_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS user_profiles_profile_photo_expires_idx
  ON user_profiles(profile_photo_expires_at)
  WHERE profile_photo_expires_at IS NOT NULL;
