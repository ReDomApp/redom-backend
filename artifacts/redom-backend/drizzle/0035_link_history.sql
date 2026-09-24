CREATE TABLE "link_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "title" varchar(200),
  "domain" varchar(255) NOT NULL,
  "source" varchar(80),
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "link_history_user_opened_idx" ON "link_history" USING btree ("user_id", "opened_at");
