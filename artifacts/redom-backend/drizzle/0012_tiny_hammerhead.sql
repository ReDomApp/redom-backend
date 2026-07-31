ALTER TABLE "login_history" ADD COLUMN "session_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_session_id_unique" UNIQUE("session_id");