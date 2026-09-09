CREATE TABLE IF NOT EXISTS "registration_flow_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "flow_id" varchar(16) NOT NULL,
  "device_id" varchar(255),
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "registration_flow_reservations_flow_id_unique" UNIQUE("flow_id"),
  CONSTRAINT "registration_flow_reservations_flow_id_format_chk" CHECK ("flow_id" ~ '^[0-9]{6,16}$')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "registration_flow_reservations_expires_idx" ON "registration_flow_reservations" USING btree ("expires_at");
