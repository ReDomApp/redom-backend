CREATE TABLE IF NOT EXISTS support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number varchar(12) NOT NULL UNIQUE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requester_email varchar(255),
  subject varchar(500),
  category varchar(64) NOT NULL DEFAULT 'general',
  status varchar(32) NOT NULL DEFAULT 'awaiting_support',
  reminder_sent_at timestamptz,
  last_user_message_at timestamptz,
  last_ai_message_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_cases_case_number_format CHECK (case_number ~ '^R[0-9]{11}$'),
  CONSTRAINT support_cases_status_check CHECK (status IN ('awaiting_support', 'awaiting_user', 'closed'))
);

CREATE TABLE IF NOT EXISTS support_case_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  sender_type varchar(16) NOT NULL,
  sender_email varchar(255),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_case_messages_sender_type_check CHECK (sender_type IN ('user', 'ai', 'system'))
);

CREATE TABLE IF NOT EXISTS support_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  svix_id varchar(255) NOT NULL UNIQUE,
  email_id varchar(255) NOT NULL,
  case_id uuid REFERENCES support_cases(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_cases_user_idx ON support_cases(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_cases_status_idx ON support_cases(status, last_user_message_at);
CREATE INDEX IF NOT EXISTS support_case_messages_case_idx ON support_case_messages(case_id, created_at ASC);
