CREATE TABLE IF NOT EXISTS "public_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_by" uuid NOT NULL REFERENCES "user_profiles"("id"),
  "name" varchar(150) NOT NULL,
  "description" text,
  "group_photo" text,
  "cover_photo" text,
  "member_count" integer DEFAULT 1 NOT NULL,
  "member_approval_required" boolean DEFAULT false NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "moderation_status" varchar(30) DEFAULT 'approved' NOT NULL,
  "deleted" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public_group_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" uuid NOT NULL REFERENCES "public_groups"("id"),
  "profile_id" uuid NOT NULL REFERENCES "user_profiles"("id"),
  "role" varchar(20) DEFAULT 'member' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "pending" boolean DEFAULT false NOT NULL,
  "joined_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "public_group_members_group_profile_uq" UNIQUE ("group_id","profile_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_groups_discovery_idx" ON "public_groups" ("status","deleted","moderation_status","member_count","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_group_members_profile_idx" ON "public_group_members" ("profile_id","active","pending");