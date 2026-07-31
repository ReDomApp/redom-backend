CREATE TABLE "email_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"code" varchar(6) NOT NULL,
	"purpose" varchar(30) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"purpose" varchar(30) NOT NULL,
	"verification_sid" varchar(255),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" varchar(255) NOT NULL,
	"device_id" varchar(255),
	"device_name" varchar(255),
	"platform" varchar(100),
	"browser" varchar(100),
	"user_agent" varchar(500),
	"ip_address" varchar(45),
	"country" varchar(100),
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"target" varchar(255) NOT NULL,
	"code_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_id" varchar(15) NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_id_visibility" varchar(10) DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verifications_user_idx" ON "verifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_type_idx" ON "verifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "verifications_target_idx" ON "verifications" USING btree ("target");--> statement-breakpoint
CREATE INDEX "verifications_expires_idx" ON "verifications" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "country";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_profile_id_unique" UNIQUE("profile_id");