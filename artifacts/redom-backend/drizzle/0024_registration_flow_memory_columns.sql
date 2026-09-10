ALTER TABLE "registration_flow_reservations"
  ADD COLUMN IF NOT EXISTS "registered_tables" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "memory" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint

UPDATE "registration_flow_reservations"
SET
  "registered_tables" = CASE
    WHEN "registered_tables" = '[]'::jsonb THEN '["registration_flow_reservations"]'::jsonb
    ELSE "registered_tables"
  END,
  "memory" = CASE
    WHEN "memory" = '{}'::jsonb THEN jsonb_build_object(
      'flow', jsonb_build_object(
        'flowId', "flow_id",
        'reservationId', "id",
        'status', "status",
        'expiresAt', "expires_at"
      ),
      'screens', jsonb_build_object(),
      'identity', jsonb_build_object('firstName', "first_name", 'lastName', "last_name"),
      'birthday', jsonb_build_object('dateOfBirth', "date_of_birth"),
      'gender', jsonb_build_object('gender', "gender", 'pronouns', "pronouns"),
      'phoneLookup', jsonb_build_object(
        'phoneNumber', "phone_number",
        'lookupStatus', "phone_lookup_status",
        'valid', "phone_valid",
        'active', "phone_active",
        'voip', "phone_voip",
        'fraudScore', "phone_fraud_score",
        'lineType', "phone_line_type",
        'carrier', "phone_carrier",
        'lookupRequestId', "phone_lookup_request_id"
      ),
      'networkSecurity', jsonb_build_object(
        'ipFraudScore', "ip_fraud_score",
        'proxy', "ip_proxy",
        'vpn', "ip_vpn",
        'tor', "ip_tor",
        'botStatus', "ip_bot_status",
        'countryCode', "ip_country_code"
      )
    )
    ELSE "memory"
  END;
