CREATE TABLE "account_security" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"two_factor_method" varchar(20) DEFAULT 'none' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_name" varchar(150) NOT NULL,
	"device_type" varchar(20) NOT NULL,
	"login_source" varchar(20) NOT NULL,
	"app_version" varchar(30),
	"ip_address" varchar(45) NOT NULL,
	"country" varchar(100),
	"region" varchar(100),
	"city" varchar(100),
	"login_time" timestamp DEFAULT now() NOT NULL,
	"logout_time" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"session_status" varchar(30) DEFAULT 'active' NOT NULL,
	"hidden_by_user" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_security" ADD CONSTRAINT "account_security_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;