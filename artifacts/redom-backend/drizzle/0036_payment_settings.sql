CREATE TABLE "payment_settings" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "currency" varchar(3) NOT NULL DEFAULT 'NGN',
  "pin_enabled" boolean NOT NULL DEFAULT false,
  "biometric_enabled" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
