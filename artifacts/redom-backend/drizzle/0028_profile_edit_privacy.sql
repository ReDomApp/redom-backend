ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS bio_privacy varchar(32) NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS current_city_privacy varchar(32) NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS hometown_privacy varchar(32) NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS birthday_month_day_privacy varchar(32) NOT NULL DEFAULT 'friends_of_friends',
  ADD COLUMN IF NOT EXISTS birthday_year_privacy varchar(32) NOT NULL DEFAULT 'friends_of_friends';

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_bio_privacy_check,
  DROP CONSTRAINT IF EXISTS user_profiles_current_city_privacy_check,
  DROP CONSTRAINT IF EXISTS user_profiles_hometown_privacy_check,
  DROP CONSTRAINT IF EXISTS user_profiles_birthday_month_day_privacy_check,
  DROP CONSTRAINT IF EXISTS user_profiles_birthday_year_privacy_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_bio_privacy_check CHECK (bio_privacy IN ('public','friends_of_friends','friends','only_me','custom')),
  ADD CONSTRAINT user_profiles_current_city_privacy_check CHECK (current_city_privacy IN ('public','friends_of_friends','friends','only_me','custom')),
  ADD CONSTRAINT user_profiles_hometown_privacy_check CHECK (hometown_privacy IN ('public','friends_of_friends','friends','only_me','custom')),
  ADD CONSTRAINT user_profiles_birthday_month_day_privacy_check CHECK (birthday_month_day_privacy IN ('public','friends_of_friends','friends','only_me','custom')),
  ADD CONSTRAINT user_profiles_birthday_year_privacy_check CHECK (birthday_year_privacy IN ('public','friends_of_friends','friends','only_me','custom'));

CREATE INDEX IF NOT EXISTS user_profiles_current_city_idx ON user_profiles (current_city);
CREATE INDEX IF NOT EXISTS user_profiles_hometown_idx ON user_profiles (hometown);
