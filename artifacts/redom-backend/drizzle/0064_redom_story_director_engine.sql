CREATE TABLE IF NOT EXISTS redom_ai_video_story_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES redom_ai_video_projects(id) ON DELETE CASCADE,
  scope varchar(24) NOT NULL,
  subject_key varchar(240),
  fact text NOT NULL,
  knowledge_state varchar(24) NOT NULL DEFAULT 'known',
  reveal_episode integer,
  reveal_scene integer,
  source varchar(32) NOT NULL DEFAULT 'story_engine',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX redom_ai_video_story_knowledge_project_scope_idx ON redom_ai_video_story_knowledge(project_id, scope);
CREATE INDEX redom_ai_video_story_knowledge_reveal_idx ON redom_ai_video_story_knowledge(project_id, reveal_episode, reveal_scene);

CREATE TABLE IF NOT EXISTS redom_ai_video_story_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES redom_ai_video_projects(id) ON DELETE CASCADE,
  event_type varchar(32) NOT NULL,
  title varchar(240) NOT NULL,
  description text NOT NULL,
  episode_number integer,
  scene_number integer,
  audience_state varchar(24) NOT NULL DEFAULT 'hidden',
  planted boolean NOT NULL DEFAULT false,
  payoff_episode integer,
  payoff_scene integer,
  related_entity_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX redom_ai_video_story_events_project_type_idx ON redom_ai_video_story_events(project_id, event_type);
CREATE INDEX redom_ai_video_story_events_payoff_idx ON redom_ai_video_story_events(project_id, payoff_episode, payoff_scene);

CREATE TABLE IF NOT EXISTS redom_ai_video_story_arcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES redom_ai_video_projects(id) ON DELETE CASCADE,
  name varchar(240) NOT NULL,
  arc_type varchar(48) NOT NULL,
  objective text NOT NULL,
  starting_state text NOT NULL,
  turning_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolution text,
  entity_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(24) NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX redom_ai_video_story_arcs_project_name_unique ON redom_ai_video_story_arcs(project_id, name);

CREATE TABLE IF NOT EXISTS redom_ai_video_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES redom_ai_video_projects(id) ON DELETE CASCADE,
  version integer NOT NULL,
  instruction text NOT NULL,
  reason varchar(48) NOT NULL DEFAULT 'user_revision',
  affected_scope jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX redom_ai_video_revisions_project_version_unique ON redom_ai_video_revisions(project_id, version);
