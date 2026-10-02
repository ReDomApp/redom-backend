CREATE TABLE IF NOT EXISTS redom_ai_image_quota (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entitlement varchar(50) NOT NULL,
  window_started_at timestamptz NOT NULL,
  window_reset_at timestamptz NOT NULL,
  "limit" integer NOT NULL,
  used integer NOT NULL DEFAULT 0,
  reserved integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS redom_ai_image_quota_user_window_unique
  ON redom_ai_image_quota(user_id, window_started_at);

CREATE INDEX IF NOT EXISTS redom_ai_image_quota_user_reset_idx
  ON redom_ai_image_quota(user_id, window_reset_at);
