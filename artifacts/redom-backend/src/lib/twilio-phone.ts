import { twilioClient } from "./twilio";

export interface TwilioPhoneLookupResult {
  phone_number: string;
  national_format: string | null;
  country: string | null;
  country_code: string | null;
  calling_country_code: string | null;
  validation_errors: string[] | null;
  valid: boolean;
  message: string;
}

/** Performs Twilio Lookup Basic phone validation. */
export async function checkTwilioPhone(
  phoneNumber: string,
): Promise<TwilioPhoneLookupResult> {
  const result = await twilioClient.lookups.v2
    .phoneNumbers(phoneNumber)
    .fetch();

  const countryCode = result.countryCode?.toUpperCase() || null;
  const valid = Boolean(result.valid);

  return {
    phone_number: result.phoneNumber || phoneNumber,
    national_format: result.nationalFormat || null,
    country: result.country || null,
    country_code: countryCode,
    calling_country_code: result.callingCountryCode || null,
    validation_errors: result.validationErrors?.length
      ? result.validationErrors.map(String)
      : null,
    valid,
    message: valid ? "Valid country number." : "Invalid phone number.",
  };
}
