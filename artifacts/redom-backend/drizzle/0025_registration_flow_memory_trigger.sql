CREATE OR REPLACE FUNCTION register_registration_flow_memory()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.phone_lookup_status = 'verified' AND NEW.phone_number IS NOT NULL THEN
    INSERT INTO "registration_flow_memory" (
      "flow_id",
      "reservation_id",
      "completion_state",
      "registered_tables",
      "memory",
      "registered_at",
      "updated_at"
    )
    VALUES (
      NEW.flow_id,
      NEW.id,
      'phone_verified',
      '["registration_flow_reservations","registration_flow_memory","registration_challenges","users","userProfiles","accountSecurity","verification"]'::jsonb,
      jsonb_build_object(
        'identity', jsonb_build_object(
          'firstName', NEW.first_name,
          'lastName', NEW.last_name
        ),
        'birthday', jsonb_build_object(
          'dateOfBirth', NEW.date_of_birth
        ),
        'gender', jsonb_build_object(
          'gender', NEW.gender,
          'pronouns', NEW.pronouns
        ),
        'contact', jsonb_build_object(
          'phoneNumber', NEW.phone_number,
          'phoneCountryCode', NEW.phone_country_code
        ),
        'phoneLookup', jsonb_build_object(
          'status', NEW.phone_lookup_status,
          'valid', NEW.phone_valid,
          'active', NEW.phone_active,
          'voip', NEW.phone_voip,
          'fraudScore', NEW.phone_fraud_score,
          'lineType', NEW.phone_line_type,
          'carrier', NEW.phone_carrier,
          'countryCode', NEW.phone_lookup_country_code,
          'requestId', NEW.phone_lookup_request_id,
          'checkedAt', NEW.phone_lookup_at
        ),
        'networkSecurity', jsonb_build_object(
          'fraudScore', NEW.ip_fraud_score,
          'proxy', NEW.ip_proxy,
          'vpn', NEW.ip_vpn,
          'tor', NEW.ip_tor,
          'botStatus', NEW.ip_bot_status,
          'countryCode', NEW.ip_country_code
        )
      ),
      COALESCE(NEW.phone_lookup_at, now()),
      now()
    )
    ON CONFLICT (flow_id) DO UPDATE SET
      reservation_id = EXCLUDED.reservation_id,
      completion_state = EXCLUDED.completion_state,
      registered_tables = EXCLUDED.registered_tables,
      memory = EXCLUDED.memory,
      updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS registration_flow_memory_after_phone_verified ON "registration_flow_reservations";
--> statement-breakpoint
CREATE TRIGGER registration_flow_memory_after_phone_verified
AFTER INSERT OR UPDATE OF "phone_lookup_status", "phone_number", "first_name", "last_name", "date_of_birth", "gender", "pronouns"
ON "registration_flow_reservations"
FOR EACH ROW
EXECUTE FUNCTION register_registration_flow_memory();
