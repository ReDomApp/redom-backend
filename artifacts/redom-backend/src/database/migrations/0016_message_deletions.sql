CREATE TABLE IF NOT EXISTS message_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS message_deletions_message_user_unique
  ON message_deletions(message_id, user_id);

CREATE INDEX IF NOT EXISTS message_deletions_user_idx
  ON message_deletions(user_id, deleted_at DESC);
