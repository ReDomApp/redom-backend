DROP INDEX IF EXISTS redom_ai_image_quota_user_window_unique;
CREATE UNIQUE INDEX IF NOT EXISTS redom_ai_image_quota_user_unique
  ON redom_ai_image_quota(user_id);
