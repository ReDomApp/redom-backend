CREATE TABLE "refund_product_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_key" varchar(120) NOT NULL,
	"country_code" varchar(2),
	"region" varchar(60),
	"policy_version" varchar(40) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"policy_document" jsonb,
	"effective_from" timestamp with time zone,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_product_policies_key_unique" UNIQUE("product_key", "country_code", "region", "policy_version")
);
--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"product_key" varchar(120),
	"transaction_number" varchar(120),
	"account_profile_id" varchar(64),
	"country_code" varchar(2),
	"currency" varchar(10),
	"amount" numeric(18, 2),
	"status" varchar(40) DEFAULT 'transaction_required' NOT NULL,
	"review_available_at" timestamp with time zone,
	"verification_sent_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"review_started_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"decision" varchar(20),
	"decision_reason" text,
	"reviewer_id" uuid,
	"reviewer_role" varchar(60),
	"refund_target_type" varchar(40),
	"refund_target_masked" varchar(120),
	"refund_expected_by" timestamp with time zone,
	"refund_completed_at" timestamp with time zone,
	"case_invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "refund_requests_case_idx" ON "refund_requests" USING btree ("case_id");
--> statement-breakpoint
CREATE INDEX "refund_requests_user_idx" ON "refund_requests" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "refund_requests_transaction_idx" ON "refund_requests" USING btree ("transaction_number");
--> statement-breakpoint
CREATE TABLE "refund_verification_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_type" varchar(20) NOT NULL,
	"target_masked" varchar(120) NOT NULL,
	"code_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"consumed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "refund_verification_request_idx" ON "refund_verification_challenges" USING btree ("refund_request_id");
--> statement-breakpoint
CREATE TABLE "refund_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_request_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"reviewer_role" varchar(60),
	"eligibility_result" varchar(30),
	"transaction_result" varchar(30),
	"policy_version" varchar(40),
	"decision" varchar(20),
	"decision_reason" text,
	"internal_notes" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "refund_reviews_request_idx" ON "refund_reviews" USING btree ("refund_request_id");
