CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"theme" varchar(20) DEFAULT 'system' NOT NULL,
	"language" varchar(20) DEFAULT 'system' NOT NULL,
	"political_content" boolean DEFAULT true NOT NULL,
	"following_feed" boolean DEFAULT true NOT NULL,
	"following_feed_snooze" varchar(20) DEFAULT 'off' NOT NULL,
	"sensitive_content" varchar(20) DEFAULT 'standard' NOT NULL,
	"autoplay_videos" varchar(20) DEFAULT 'off' NOT NULL,
	"auto_translate_posts" boolean DEFAULT true NOT NULL,
	"auto_translate_comments" boolean DEFAULT true NOT NULL,
	"font_size" varchar(20) DEFAULT 'medium' NOT NULL,
	"reduce_motion" boolean DEFAULT false NOT NULL,
	"high_contrast" boolean DEFAULT false NOT NULL,
	"screen_reader_mode" boolean DEFAULT false NOT NULL,
	"captions" varchar(20) DEFAULT 'automatic' NOT NULL,
	"show_join_date" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;