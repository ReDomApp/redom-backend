ALTER TABLE "support_cases" ADD COLUMN "refund_case_invalidated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "support_cases" ADD COLUMN "case_number_invalid" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX "support_cases_case_number_invalid_idx" ON "support_cases" USING btree ("case_number_invalid");
