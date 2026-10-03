CREATE TABLE IF NOT EXISTS redom_ai_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id varchar(80) NOT NULL UNIQUE,
  provider varchar(32) NOT NULL,
  model varchar(120) NOT NULL,
  operation varchar(32) NOT NULL DEFAULT 'generate',
  prompt text NOT NULL,
  target_duration_seconds integer NOT NULL,
  resolution varchar(16) NOT NULL,
  aspect_ratio varchar(16) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'queued',
  storage_key varchar(600),
  download_token_hash varchar(64),
  download_token_expires_at timestamptz,
  generation_ms integer,
  error varchar(1000),
  security_request_id varchar(100),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS redom_ai_videos_user_created_idx
  ON redom_ai_videos(user_id, created_at DESC);
