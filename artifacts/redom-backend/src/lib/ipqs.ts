import axios from "axios";

import {
  checkAbstractPhone,
  normalizeAbstractPhoneResult,
} from "./abstract-phone";

export interface IPQSResult {
  success: boolean;
  message?: string;
  fraud_score: number;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  bot_status: boolean;
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

function shouldFallbackAfterIPQSError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  const status = error.response.status;
  return status === 402 || status === 408 || status === 422 || status === 425 || status === 429 || status >= 500;
}

function shouldFallbackAfterIPQSResult(result: IPQSPhoneResult): boolean {
  return !result.success && isIPQSServiceFailureMessage(result.message);
}

export async function checkIP(ip: string): Promise<IPQSResult> {
  const apiKey = requireApiKey();
  const url = `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}`;
  const { data } = await axios.get<IPQSResult>(url, { timeout: 10_000 });
  return data;
}

export async function checkPhone(
  phoneNumber: string,
  options?: { countryCode?: string; allowFallback?: boolean },
): Promise<IPQSPhoneResult> {
  const apiKey = requireApiKey();
  const params = new URLSearchParams({ strictness: "1" });
  if (options?.countryCode) {
    params.append("country[]", options.countryCode.toUpperCase());
  }

  const url = `https://ipqualityscore.com/api/json/phone/${apiKey}/${encodeURIComponent(phoneNumber)}?${params.toString()}`;
  const allowFallback = options?.allowFallback !== false;

  try {
    const { data } = await axios.get<IPQSPhoneResult>(url, { timeout: 15_000 });

    if (!allowFallback) return data;

    // A definitive IPQS validation result (including valid=false) is not a
    // provider failure and must never be overridden by the fallback.
    if (!shouldFallbackAfterIPQSResult(data)) return data;

    const abstractResult = await checkAbstractPhone(phoneNumber, options);
    return normalizeAbstractPhoneResult(abstractResult, options?.countryCode || "");
  } catch (error) {
    // The Twilio post-validation enrichment path uses allowFallback=false and
    // handles this error itself, preserving the successful Twilio result.
    if (!allowFallback) throw error;
    if (!shouldFallbackAfterIPQSError(error)) throw error;

    const abstractResult = await checkAbstractPhone(phoneNumber, options);
    return normalizeAbstractPhoneResult(abstractResult, options?.countryCode || "");
  }
}
