CREATE TYPE "public"."account_status" AS ENUM('pending', 'active', 'suspended', 'banned');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'custom');--> statement-breakpoint
CREATE TYPE "public"."profile_id_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "two_factor_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_security_id" uuid NOT NULL,
	"code_hash" varchar(255) NOT NULL,
	"code_length" integer NOT NULL,
	"used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "two_factor_recovery_codes_length_valid" CHECK ("two_factor_recovery_codes"."code_length" >= 6 AND "two_factor_recovery_codes"."code_length" <= 15)
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_phone_number_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_profile_id_unique";--> statement-breakpoint
ALTER TABLE "account_security" ALTER COLUMN "two_factor_method" SET DEFAULT 'off';--> statement-breakpoint
ALTER TABLE "active_sessions" ALTER COLUMN "session_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "gender" SET DATA TYPE "public"."gender" USING "gender"::"public"."gender";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "profile_id_visibility" SET DEFAULT 'public'::"public"."profile_id_visibility";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "profile_id_visibility" SET DATA TYPE "public"."profile_id_visibility" USING "profile_id_visibility"::"public"."profile_id_visibility";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "account_status" SET DEFAULT 'pending'::"public"."account_status";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "account_status" SET DATA TYPE "public"."account_status" USING "account_status"::"public"."account_status";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "public_id" varchar(15) NOT NULL;--> statement-breakpoint
ALTER TABLE "two_factor_recovery_codes" ADD CONSTRAINT "two_factor_recovery_codes_account_security_id_account_security_id_fk" FOREIGN KEY ("account_security_id") REFERENCES "public"."account_security"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_sessions" ADD CONSTRAINT "active_sessions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_public_id_unique" ON "users" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_profile_id_unique" ON "users" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_number_unique" ON "users" USING btree ("phone_number");--> statement-breakpoint
ALTER TABLE "account_security" ADD CONSTRAINT "account_security_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "active_sessions" ADD CONSTRAINT "active_sessions_session_id_unique" UNIQUE("session_id");--> statement-breakpoint
ALTER TABLE "account_security" ADD CONSTRAINT "account_security_two_factor_method_valid" CHECK ("account_security"."two_factor_method" IN ('off', 'authenticator', 'email', 'phone'));--> statement-breakpoint
ALTER TABLE "account_security" ADD CONSTRAINT "account_security_two_factor_state_valid" CHECK ((
        ("account_security"."two_factor_enabled" = false AND "account_security"."two_factor_method" = 'off')
        OR
        ("account_security"."two_factor_enabled" = true AND "account_security"."two_factor_method" IN ('authenticator', 'email', 'phone'))
      ));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_contact_method_required" CHECK ("email" IS NOT NULL OR "phone_number" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_public_id_format" CHECK ("public_id" ~ '^234[1-9][0-9]{11}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_profile_id_format" CHECK ("profile_id" ~ '^234[1-9][0-9]{11}$');