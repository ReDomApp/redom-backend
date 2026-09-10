import { checkAbstractPhone, normalizeAbstractPhoneResult } from "./abstract-phone";
import { checkTwilioPhone } from "./twilio-phone";
import { checkIP } from "./ipapi";

export { checkIP };

export type PhoneLookupProvider = "abstract" | "twilio";
export type PhoneLookupType = "phone-validation" | "basic";

export interface PhoneLookupResult {
  success: boolean;
  message?: string;
  formatted?: string;
  local_format?: string;
  fraud_score: number;
  valid?: boolean;
  active?: boolean | null;
  VOIP?: boolean | null;
  prepaid?: boolean | null;
  risky?: boolean | null;
  recent_abuse?: boolean | null;
  leaked?: boolean | null;
  spammer?: boolean | null;
  carrier?: string | null;
  line_type?: string | null;
  country?: string | null;
  country_code?: string | null;
  region?: string | null;
  city?: string | null;
  timezone?: string | null;
  dialing_code?: number | null;
  accurate_country_code?: boolean | null;
  active_status?: string | null;
  user_activity?: string | null;
  request_id?: string | null;
  provider?: PhoneLookupProvider;
  lookup_type?: PhoneLookupType;
}

/**
 * ReDom phone-validation chain.
 * IPQS is intentionally absent: Twilio Basic Lookup is primary and Abstract
 * Phone Validation is the only fallback.
 */
export async function checkPhone(
  phoneNumber: string,
  options?: { countryCode?: string },
): Promise<PhoneLookupResult> {
  const selectedCountry = options?.countryCode?.toUpperCase() || "";

  try {
    const twilioResult = await checkTwilioPhone(phoneNumber);
    const twilioCountry = twilioResult.country_code?.toUpperCase() || null;
    const countryMatches = !selectedCountry || !twilioCountry || twilioCountry === selectedCountry;

    // A definitive Twilio validation result is returned immediately. Only an
    // actual provider failure falls through to Abstract.
    if (twilioResult.valid || twilioResult.validation_errors?.length) {
      return {
        success: true,
        message: twilioResult.validation_errors?.join(", ") || twilioResult.message,
        formatted: twilioResult.phone_number,
        local_format: twilioResult.national_format || undefined,
        fraud_score: 0,
        valid: twilioResult.valid && countryMatches,
        active: null,
        VOIP: null,
        prepaid: null,
        risky: null,
        recent_abuse: null,
        leaked: null,
        spammer: null,
        carrier: null,
        line_type: null,
        country: twilioResult.country,
        country_code: twilioCountry,
        region: null,
        city: null,
        timezone: null,
        dialing_code: twilioResult.calling_country_code ? Number(twilioResult.calling_country_code) : null,
        accurate_country_code: countryMatches,
        active_status: null,
        user_activity: null,
        request_id: null,
        provider: "twilio",
        lookup_type: "basic",
      };
    }
  } catch {
    // Twilio provider failure only: continue to Abstract.
  }

  try {
    return normalizeAbstractPhoneResult(
      await checkAbstractPhone(phoneNumber, options),
      selectedCountry,
    ) as PhoneLookupResult;
  } catch {
    throw new Error("All phone validation providers are temporarily unavailable.");
  }
}

/** True when both supported phone providers are unavailable. */
export function isPhoneProviderFailure(error: unknown): boolean {
  return error instanceof Error && /phone validation providers are temporarily unavailable/i.test(error.message);
}
