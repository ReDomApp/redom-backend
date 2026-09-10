import axios from "axios";

import { checkAbstractPhone, normalizeAbstractPhoneResult } from "./abstract-phone";
import { checkTwilioPhone } from "./twilio-phone";

export interface IPQSResult {
  success: boolean;
  message?: string;
  fraud_score: number;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  bot_status: boolean;
  hosting?: boolean;
  ISP?: string;
  organization?: string;
  ASN?: number;
  country_code?: string;
  recent_abuse?: boolean;
  active_vpn?: boolean;
  active_tor?: boolean;
  request_id?: string;
}

export interface IPQSPhoneResult {
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
  provider?: "ipqs" | "abstract" | "twilio";
  lookup_type?: "phone-validation" | "basic";
}

function requireApiKey(): string {
  const apiKey = process.env.IPQS_API_KEY?.trim();
  if (!apiKey) throw new Error("IPQS_API_KEY is not configured.");
  return apiKey;
}

function isIPQSServiceFailureMessage(message?: string): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return /insufficient\s+credits?|credit\s+(?:balance|quota)|quota\s+(?:reached|exhausted)|temporarily\s+unavailable|service\s+unavailable|internal\s+server|rate\s+limit|too\s+many\s+requests|try\s+again\s+later/.test(normalized);
}

function getAxiosResponseMessage(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const data = error.response?.data as unknown;
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  return typeof record.message === "string"
    ? record.message
    : typeof record.error === "string"
      ? record.error
      : undefined;
}

function shouldFallbackAfterIPQSError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const responseMessage = getAxiosResponseMessage(error);
  if (isIPQSServiceFailureMessage(responseMessage)) return true;
  if (!error.response) return true;
  const status = error.response.status;
  return status === 402 || status === 408 || status === 422 || status === 425 || status === 429 || status >= 500;
}

/** True for an upstream phone-provider availability failure. */
export function isPhoneProviderFailure(error: unknown): boolean {
  if (error instanceof Error && /Abstract phone validation provider unavailable/i.test(error.message)) return true;
  return shouldFallbackAfterIPQSError(error);
}

export async function checkIP(ip: string): Promise<IPQSResult> {
  const apiKey = requireApiKey();
  const url = `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}`;
  const { data } = await axios.get<IPQSResult>(url, { timeout: 10_000 });
  return data;
}

/**
 * Registration phone-validation order:
 * Twilio Basic Lookup -> Abstract Phone -> IPQS Phone.
 * IPQS is deliberately the final phone provider, so an IPQS credit/provider
 * problem cannot interrupt a successful Twilio or Abstract validation.
 */
export async function checkPhone(
  phoneNumber: string,
  options?: { countryCode?: string; allowFallback?: boolean },
): Promise<IPQSPhoneResult> {
  const selectedCountry = options?.countryCode?.toUpperCase() || "";

  try {
    const twilioResult = await checkTwilioPhone(phoneNumber);
    const twilioCountry = twilioResult.country_code?.toUpperCase() || null;
    const countryMatches = !selectedCountry || !twilioCountry || twilioCountry === selectedCountry;

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
  } catch (twilioError) {
    // Twilio provider failure: continue to Abstract.
  }

  try {
    const abstractResult = await checkAbstractPhone(phoneNumber, options);
    return normalizeAbstractPhoneResult(abstractResult, selectedCountry) as IPQSPhoneResult;
  } catch (abstractError) {
    // Abstract provider failure: IPQS is the final phone-validation provider.
  }

  try {
    const apiKey = requireApiKey();
    const params = new URLSearchParams({ strictness: "1" });
    if (selectedCountry) params.append("country[]", selectedCountry);
    const url = `https://ipqualityscore.com/api/json/phone/${apiKey}/${encodeURIComponent(phoneNumber)}?${params.toString()}`;
    const { data } = await axios.get<IPQSPhoneResult>(url, { timeout: 15_000 });
    const result = { ...data, provider: "ipqs" as const, lookup_type: "phone-validation" as const };

    if (!result.success && isIPQSServiceFailureMessage(result.message)) {
      throw new Error("All phone validation providers are temporarily unavailable.");
    }

    const returnedCountry = result.country_code?.trim().toUpperCase() || "";
    if (selectedCountry && returnedCountry && returnedCountry !== selectedCountry) {
      return {
        ...result,
        valid: false,
        accurate_country_code: false,
        message: "The phone number country does not match the selected country code.",
      };
    }

    // IPQS is the final fallback. Its parsed national format is used as the
    // country-specific length reference rather than maintaining our own global
    // numbering-plan table. This supplements IPQS's validity decision.
    const nationalDigits = result.local_format?.replace(/\D/g, "") || "";
    const e164Digits = result.formatted?.replace(/\D/g, "") || "";
    const dialingDigits = String(result.dialing_code ?? "").replace(/\D/g, "");
    if (nationalDigits && e164Digits) {
      const subscriberDigits = dialingDigits && e164Digits.startsWith(dialingDigits)
        ? e164Digits.slice(dialingDigits.length)
        : nationalDigits;
      if (subscriberDigits.length !== nationalDigits.length) {
        return { ...result, valid: false, message: "The phone number length does not match the selected country." };
      }
    }

    return result;
  } catch (ipqsError) {
    if (ipqsError instanceof Error && /All phone validation providers are temporarily unavailable/i.test(ipqsError.message)) {
      throw ipqsError;
    }
    if (shouldFallbackAfterIPQSError(ipqsError)) {
      throw new Error("All phone validation providers are temporarily unavailable.");
    }
    throw ipqsError;
  }
}
