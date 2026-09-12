CREATE TABLE IF NOT EXISTS "comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "parent_comment_id" uuid,
  "reply_to_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "public_id" varchar(16) NOT NULL,
  "share_slug" varchar(160) NOT NULL,
  "content" text NOT NULL,
  "edited" boolean DEFAULT false NOT NULL,
  "deleted" boolean DEFAULT false NOT NULL,
  "hidden" boolean DEFAULT false NOT NULL,
  "pinned" boolean DEFAULT false NOT NULL,
  "like_count" integer DEFAULT 0 NOT NULL,
  "reply_count" integer DEFAULT 0 NOT NULL,
  "report_count" integer DEFAULT 0 NOT NULL,
  "moderation_status" varchar(30) DEFAULT 'approved' NOT NULL,
  "spam_detected" boolean DEFAULT false NOT NULL,
  "ai_reviewed" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "comments_public_id_unique" UNIQUE("public_id")
);

CREATE INDEX IF NOT EXISTS "comments_post_created_idx" ON "comments" USING btree ("post_id", "created_at");
CREATE INDEX IF NOT EXISTS "comments_post_pinned_idx" ON "comments" USING btree ("post_id", "pinned", "created_at");
CREATE INDEX IF NOT EXISTS "comments_parent_idx" ON "comments" USING btree ("parent_comment_id");
