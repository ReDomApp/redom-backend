CREATE TABLE "user_privacy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_visibility" varchar(20) DEFAULT 'public' NOT NULL,
	"friend_requests" varchar(30) DEFAULT 'public' NOT NULL,
	"messages" varchar(40) DEFAULT 'message_requests' NOT NULL,
	"comments" varchar(30) DEFAULT 'friends' NOT NULL,
	"mentions" varchar(30) DEFAULT 'friends' NOT NULL,
	"tags" varchar(30) DEFAULT 'friends' NOT NULL,
	"friends_list_visibility" varchar(20) DEFAULT 'friends' NOT NULL,
	"followers_visibility" varchar(20) DEFAULT 'friends' NOT NULL,
	"following_visibility" varchar(20) DEFAULT 'friends' NOT NULL,
	"redom_id_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_privacy" ADD CONSTRAINT "user_privacy_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;