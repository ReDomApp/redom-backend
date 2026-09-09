CREATE TABLE "registration_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contact_type" varchar(10) NOT NULL,
  "target" varchar(255) NOT NULL,
  "normalized_target" varchar(255) NOT NULL,
  "first_name" varchar(100),
  "last_name" varchar(100),
  "username" varchar(50),
  "email" varchar(255),
  "phone_number" varchar(20),
  "date_of_birth" varchar(10),
  "gender" varchar(10),
  "password_hash" varchar(255),
  "current_step" varchar(30) DEFAULT 'contact' NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "request_ip" varchar(100),
  "user_agent" varchar(1000),
  "device_id" varchar(255),
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "registration_challenges_target_idx" ON "registration_challenges" USING btree ("normalized_target");
--> statement-breakpoint
CREATE INDEX "registration_challenges_status_idx" ON "registration_challenges" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "registration_challenges_expires_idx" ON "registration_challenges" USING btree ("expires_at");
