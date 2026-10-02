CREATE TABLE IF NOT EXISTS redom_ai_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id varchar(80) NOT NULL UNIQUE,
  operation varchar(30) NOT NULL,
  model varchar(100) NOT NULL,
  model_id varchar(255),
  prompt text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  steps integer NOT NULL,
  seed varchar(64),
  storage_key varchar(600),
  status varchar(24) NOT NULL DEFAULT 'completed',
  generation_ms integer,
  error varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS redom_ai_images_user_created_idx
  ON redom_ai_images(user_id, created_at DESC);
