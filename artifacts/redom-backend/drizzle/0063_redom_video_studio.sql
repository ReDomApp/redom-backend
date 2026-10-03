CREATE TABLE IF NOT EXISTS redom_ai_video_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(240) NOT NULL,
  prompt text NOT NULL,
  format varchar(32) NOT NULL DEFAULT 'movie',
  target_duration_seconds integer NOT NULL,
  quality varchar(24) NOT NULL DEFAULT 'high',
  style varchar(64) NOT NULL DEFAULT 'cinematic',
  aspect_ratio varchar(16) NOT NULL DEFAULT '16:9',
  audio_enabled boolean NOT NULL DEFAULT true,
  voice_enabled boolean NOT NULL DEFAULT true,
  state varchar(24) NOT NULL DEFAULT 'draft',
  bible jsonb,
  research jsonb,
  continuity_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX redom_ai_video_projects_user_created_idx ON redom_ai_video_projects(user_id, created_at);

CREATE TABLE IF NOT EXISTS redom_ai_video_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES redom_ai_video_projects(id) ON DELETE CASCADE,
  kind varchar(32) NOT NULL,
  name varchar(180) NOT NULL,
  identity_profile jsonb NOT NULL,
  state jsonb NOT NULL,
  reference_asset_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  embedding_ref varchar(600),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX redom_ai_video_entities_project_name_unique ON redom_ai_video_entities(project_id, name);
CREATE INDEX redom_ai_video_entities_project_kind_idx ON redom_ai_video_entities(project_id, kind);

CREATE TABLE IF NOT EXISTS redom_ai_video_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES redom_ai_video_projects(id) ON DELETE CASCADE,
  episode_number integer NOT NULL,
  title varchar(240) NOT NULL,
  synopsis text NOT NULL,
  target_duration_seconds integer NOT NULL,
  story_state_before jsonb NOT NULL,
  story_state_after jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX redom_ai_video_episodes_project_number_unique ON redom_ai_video_episodes(project_id, episode_number);

CREATE TABLE IF NOT EXISTS redom_ai_video_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES redom_ai_video_episodes(id) ON DELETE CASCADE,
  scene_number integer NOT NULL,
  title varchar(240) NOT NULL,
  synopsis text NOT NULL,
  duration_seconds integer NOT NULL,
  location_entity_id uuid REFERENCES redom_ai_video_entities(id) ON DELETE SET NULL,
  character_entity_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  continuity_state jsonb NOT NULL,
  director_notes text,
  status varchar(24) NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX redom_ai_video_scenes_episode_number_unique ON redom_ai_video_scenes(episode_id, scene_number);

CREATE TABLE IF NOT EXISTS redom_ai_video_shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES redom_ai_video_scenes(id) ON DELETE CASCADE,
  shot_number integer NOT NULL,
  duration_seconds integer NOT NULL,
  action text NOT NULL,
  camera jsonb NOT NULL,
  lighting jsonb NOT NULL,
  motion jsonb NOT NULL,
  dialogue jsonb NOT NULL DEFAULT '[]'::jsonb,
  sound jsonb NOT NULL,
  entity_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  generation_prompt text NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'planned',
  output_asset_key varchar(600),
  continuity_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX redom_ai_video_shots_scene_number_unique ON redom_ai_video_shots(scene_id, shot_number);

CREATE TABLE IF NOT EXISTS redom_ai_video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES redom_ai_video_projects(id) ON DELETE CASCADE,
  shot_id uuid REFERENCES redom_ai_video_shots(id) ON DELETE SET NULL,
  job_id varchar(100) NOT NULL,
  kind varchar(32) NOT NULL DEFAULT 'shot_generation',
  status varchar(24) NOT NULL DEFAULT 'queued',
  priority integer NOT NULL DEFAULT 100,
  payload jsonb NOT NULL,
  output_asset_key varchar(600),
  error varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
CREATE UNIQUE INDEX redom_ai_video_jobs_job_id_unique ON redom_ai_video_jobs(job_id);
CREATE INDEX redom_ai_video_jobs_project_status_idx ON redom_ai_video_jobs(project_id, status);

CREATE TABLE IF NOT EXISTS redom_ai_video_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES redom_ai_video_projects(id) ON DELETE CASCADE,
  source_type varchar(32) NOT NULL,
  title varchar(300) NOT NULL,
  url varchar(1200),
  summary text NOT NULL,
  claims jsonb NOT NULL DEFAULT '[]'::jsonb,
  rights_basis varchar(64) NOT NULL DEFAULT 'factual_reference',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX redom_ai_video_research_project_created_idx ON redom_ai_video_research(project_id, created_at);
