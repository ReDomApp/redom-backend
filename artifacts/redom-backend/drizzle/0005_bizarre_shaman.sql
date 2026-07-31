CREATE TABLE "active_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"device_name" varchar(150) NOT NULL,
	"device_type" varchar(20) NOT NULL,
	"login_source" varchar(20) NOT NULL,
	"app_version" varchar(30),
	"ip_address" varchar(45) NOT NULL,
	"country" varchar(100),
	"region" varchar(100),
	"city" varchar(100),
	"login_time" timestamp DEFAULT now() NOT NULL,
	"last_activity" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_type" varchar(100) NOT NULL,
	"activity_category" varchar(50) NOT NULL,
	"activity_title" varchar(255) NOT NULL,
	"activity_description" varchar(1000),
	"activity_icon" varchar(100),
	"target_id" uuid,
	"target_type" varchar(50),
	"target_title" varchar(255),
	"thumbnail_url" varchar(1000),
	"target_url" varchar(1000),
	"device_name" varchar(150),
	"device_type" varchar(20),
	"source" varchar(20),
	"country" varchar(100),
	"region" varchar(100),
	"city" varchar(100),
	"status" varchar(20) DEFAULT 'success' NOT NULL,
	"triggered_by" varchar(20) DEFAULT 'user' NOT NULL,
	"undo_supported" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"activity_time" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"verification_status" varchar(30) DEFAULT 'not_invited' NOT NULL,
	"verification_type" varchar(20) NOT NULL,
	"invited_at" timestamp,
	"application_submitted_at" timestamp,
	"review_started_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"revoked_at" timestamp,
	"suspended_at" timestamp,
	"expires_at" timestamp,
	"rejection_reason" varchar(1000),
	"revocation_reason" varchar(1000),
	"suspension_reason" varchar(1000),
	"review_notes" varchar(3000),
	"reviewed_by" varchar(50),
	"badge_visible" boolean DEFAULT false NOT NULL,
	"can_reapply" boolean DEFAULT true NOT NULL,
	"review_time_hours" varchar(10) DEFAULT '24',
	"application_attempts" varchar(10) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "verification_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "verification_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"verification_order_number" varchar(30) NOT NULL,
	"document_type" varchar(30) NOT NULL,
	"front_capture" varchar(1000),
	"back_capture" varchar(1000),
	"selfie_capture" varchar(1000),
	"liveness_capture" varchar(1000),
	"live_capture_verified" boolean DEFAULT false NOT NULL,
	"screenshot_detected" boolean DEFAULT false NOT NULL,
	"screen_photo_detected" boolean DEFAULT false NOT NULL,
	"edited_image_detected" boolean DEFAULT false NOT NULL,
	"ai_generated_detected" boolean DEFAULT false NOT NULL,
	"blurry_image_detected" boolean DEFAULT false NOT NULL,
	"face_matched" boolean DEFAULT false NOT NULL,
	"document_matched" boolean DEFAULT false NOT NULL,
	"verification_result" varchar(30) DEFAULT 'pending' NOT NULL,
	"review_notes" varchar(3000),
	"reviewed_by" varchar(50),
	"fraud_detected" boolean DEFAULT false NOT NULL,
	"temporarily_blocked" boolean DEFAULT false NOT NULL,
	"block_reason" varchar(1000),
	"block_lift_date" timestamp,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_type" varchar(30) NOT NULL,
	"subscription_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"billing_cycle" varchar(20) DEFAULT 'monthly' NOT NULL,
	"payment_provider" varchar(30),
	"payment_reference" varchar(255),
	"auto_renew" boolean DEFAULT true NOT NULL,
	"started_at" timestamp,
	"renewed_at" timestamp,
	"expires_at" timestamp,
	"cancelled_at" timestamp,
	"suspended_reason" varchar(1000),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "active_sessions" ADD CONSTRAINT "active_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification" ADD CONSTRAINT "verification_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_subscriptions" ADD CONSTRAINT "verification_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;