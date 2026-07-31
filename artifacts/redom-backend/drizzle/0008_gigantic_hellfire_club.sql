CREATE TABLE "draft_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" varchar(150),
	"caption" text,
	"privacy" varchar(30) DEFAULT 'friends' NOT NULL,
	"photos" jsonb,
	"videos" jsonb,
	"gifs" jsonb,
	"poll_id" uuid,
	"location" jsonb,
	"feeling" varchar(100),
	"activity" varchar(100),
	"mentions" jsonb,
	"tagged_users" jsonb,
	"auto_saved" boolean DEFAULT true NOT NULL,
	"manually_saved" boolean DEFAULT false NOT NULL,
	"ready_to_publish" boolean DEFAULT false NOT NULL,
	"has_unsaved_changes" boolean DEFAULT false NOT NULL,
	"moved_to_scheduled_posts" boolean DEFAULT false NOT NULL,
	"ai_reviewed" boolean DEFAULT false NOT NULL,
	"moderation_status" varchar(30) DEFAULT 'pending' NOT NULL,
	"media_scanned" boolean DEFAULT false NOT NULL,
	"trashed" boolean DEFAULT false NOT NULL,
	"trashed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"home_feed_enabled" boolean DEFAULT true NOT NULL,
	"following_feed_enabled" boolean DEFAULT true NOT NULL,
	"videos_feed_enabled" boolean DEFAULT true NOT NULL,
	"liked_content_score" integer DEFAULT 0 NOT NULL,
	"commented_content_score" integer DEFAULT 0 NOT NULL,
	"shared_content_score" integer DEFAULT 0 NOT NULL,
	"saved_content_score" integer DEFAULT 0 NOT NULL,
	"watched_video_score" integer DEFAULT 0 NOT NULL,
	"watch_time_score" integer DEFAULT 0 NOT NULL,
	"poll_participation_score" integer DEFAULT 0 NOT NULL,
	"sensitive_content_enabled" boolean DEFAULT true NOT NULL,
	"language_preference_enabled" boolean DEFAULT true NOT NULL,
	"friends_priority" integer DEFAULT 100 NOT NULL,
	"following_priority" integer DEFAULT 100 NOT NULL,
	"trending_priority" integer DEFAULT 100 NOT NULL,
	"newest_priority" integer DEFAULT 100 NOT NULL,
	"recommendation_eligible" boolean DEFAULT true NOT NULL,
	"recommendation_restricted" boolean DEFAULT false NOT NULL,
	"personalized_recommendations_enabled" boolean DEFAULT true NOT NULL,
	"feed_refresh_requested" boolean DEFAULT false NOT NULL,
	"infinite_feed_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"option_vote_counts" jsonb NOT NULL,
	"total_votes" integer DEFAULT 0 NOT NULL,
	"voting_type" varchar(20) DEFAULT 'single' NOT NULL,
	"voted_users" jsonb NOT NULL,
	"anonymous_voting" boolean DEFAULT false NOT NULL,
	"allow_vote_removal" boolean DEFAULT true NOT NULL,
	"duration" varchar(20) DEFAULT '24_hours' NOT NULL,
	"expires_at" timestamp with time zone,
	"manually_closed" boolean DEFAULT false NOT NULL,
	"closed" boolean DEFAULT false NOT NULL,
	"expired" boolean DEFAULT false NOT NULL,
	"ai_reviewed" boolean DEFAULT false NOT NULL,
	"moderation_status" varchar(30) DEFAULT 'approved' NOT NULL,
	"reported" boolean DEFAULT false NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"mentioned_user_id" uuid NOT NULL,
	"mentioned_by_user_id" uuid NOT NULL,
	"tagged" boolean DEFAULT true NOT NULL,
	"valid_mention" boolean DEFAULT true NOT NULL,
	"duplicate_mention" boolean DEFAULT false NOT NULL,
	"eligible_mention" boolean DEFAULT true NOT NULL,
	"privacy_allowed" boolean DEFAULT true NOT NULL,
	"notification_sent" boolean DEFAULT false NOT NULL,
	"counted_in_analytics" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reactor_id" uuid NOT NULL,
	"content_type" varchar(30) NOT NULL,
	"content_id" uuid NOT NULL,
	"reaction_type" varchar(20) DEFAULT 'like' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"spam_detected" boolean DEFAULT false NOT NULL,
	"ai_reviewed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_type" varchar(30) NOT NULL,
	"content_id" uuid NOT NULL,
	"collection_type" varchar(30) DEFAULT 'all_saves' NOT NULL,
	"custom_folder_name" varchar(100),
	"favorite" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" varchar(150),
	"caption" text,
	"privacy" varchar(30) DEFAULT 'friends' NOT NULL,
	"photos" jsonb,
	"videos" jsonb,
	"gifs" jsonb,
	"poll_id" uuid,
	"location" jsonb,
	"feeling" varchar(100),
	"activity" varchar(100),
	"mentions" jsonb,
	"tagged_users" jsonb,
	"scheduled_for" timestamp with time zone NOT NULL,
	"publish_permission_granted" boolean DEFAULT false NOT NULL,
	"upload_completed" boolean DEFAULT false NOT NULL,
	"upload_size_bytes" bigint DEFAULT 0 NOT NULL,
	"uploaded_at" timestamp with time zone,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"cancelled" boolean DEFAULT false NOT NULL,
	"ai_reviewed" boolean DEFAULT false NOT NULL,
	"moderation_status" varchar(30) DEFAULT 'pending' NOT NULL,
	"media_scanned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sharer_id" uuid NOT NULL,
	"content_type" varchar(30) NOT NULL,
	"content_id" uuid NOT NULL,
	"share_id" varchar(10) NOT NULL,
	"destination" varchar(30) NOT NULL,
	"external_platform" varchar(50),
	"valid_share" boolean DEFAULT true NOT NULL,
	"spam_detected" boolean DEFAULT false NOT NULL,
	"ai_reviewed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "draft_posts" ADD CONSTRAINT "draft_posts_creator_id_user_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_posts" ADD CONSTRAINT "draft_posts_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_preferences" ADD CONSTRAINT "feed_preferences_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_creator_id_user_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_mentioned_user_id_user_profiles_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_mentioned_by_user_id_user_profiles_id_fk" FOREIGN KEY ("mentioned_by_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_reactor_id_user_profiles_id_fk" FOREIGN KEY ("reactor_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saves" ADD CONSTRAINT "saves_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_creator_id_user_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_sharer_id_user_profiles_id_fk" FOREIGN KEY ("sharer_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;