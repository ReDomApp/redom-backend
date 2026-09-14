CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  in_app_enabled boolean NOT NULL DEFAULT true,
  message_notifications boolean NOT NULL DEFAULT true,
  group_notifications boolean NOT NULL DEFAULT true,
  call_notifications boolean NOT NULL DEFAULT true,
  reaction_notifications boolean NOT NULL DEFAULT true,
  comment_notifications boolean NOT NULL DEFAULT true,
  follower_notifications boolean NOT NULL DEFAULT true,
  friend_request_notifications boolean NOT NULL DEFAULT true,
  security_notifications boolean NOT NULL DEFAULT true,
  verification_notifications boolean NOT NULL DEFAULT true,
  support_notifications boolean NOT NULL DEFAULT true,
  show_previews boolean NOT NULL DEFAULT true,
  notification_sounds boolean NOT NULL DEFAULT true,
  vibration boolean NOT NULL DEFAULT true,
  app_badge boolean NOT NULL DEFAULT true,
  email_notifications boolean NOT NULL DEFAULT true,
  sms_notifications boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS notification_preferences_user_idx ON notification_preferences(user_id);
