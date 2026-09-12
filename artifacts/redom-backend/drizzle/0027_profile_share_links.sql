ALTER TABLE users
  ADD COLUMN profile_share_code varchar(7)
    NOT NULL
    DEFAULT lower(substr(md5(random()::text || clock_timestamp()::text || pg_backend_pid()::text), 1, 7));

CREATE UNIQUE INDEX IF NOT EXISTS users_profile_share_code_unique
  ON users (profile_share_code);
