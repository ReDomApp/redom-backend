CREATE TABLE IF NOT EXISTS "events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "creator_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "name" varchar(200) NOT NULL,
  "description" text,
  "start_at" timestamptz NOT NULL,
  "end_at" timestamptz,
  "timezone" varchar(80) NOT NULL DEFAULT 'UTC',
  "event_type" varchar(20) NOT NULL DEFAULT 'in_person',
  "privacy" varchar(20) NOT NULL DEFAULT 'public',
  "location_name" varchar(255),
  "location_city" varchar(160),
  "location_lat" double precision,
  "location_lng" double precision,
  "location_radius_miles" integer,
  "location_mode" varchar(20) NOT NULL DEFAULT 'suggested',
  "virtual_url" text,
  "repeat_rule" varchar(20) NOT NULL DEFAULT 'none',
  "cover_key" text,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "events_type_check" CHECK ("event_type" IN ('in_person','virtual')),
  CONSTRAINT "events_privacy_check" CHECK ("privacy" IN ('public','friends','private')),
  CONSTRAINT "events_repeat_check" CHECK ("repeat_rule" IN ('none','daily','weekly','monthly','yearly')),
  CONSTRAINT "events_location_mode_check" CHECK ("location_mode" IN ('suggested','custom')),
  CONSTRAINT "events_time_check" CHECK ("end_at" IS NULL OR "end_at" > "start_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "event_responses_status_check" CHECK ("status" IN ('interested','going')),
  CONSTRAINT "event_responses_event_user_uq" UNIQUE ("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_settings" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "add_events_to_calendar" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_discovery_idx" ON "events" ("status","privacy","start_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_creator_idx" ON "events" ("creator_user_id","start_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_responses_user_idx" ON "event_responses" ("user_id","updated_at");