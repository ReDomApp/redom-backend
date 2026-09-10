import axios from "axios";

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

export async function checkIP(ip: string): Promise<IPQSResult> {
  const apiKey = requireApiKey();
  const url = `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}`;
  const { data } = await axios.get<IPQSResult>(url, { timeout: 10_000 });
  return data;
}

export async function checkPhone(phoneNumber: string, options?: { countryCode?: string }): Promise<IPQSPhoneResult> {
  const apiKey = requireApiKey();
  const params = new URLSearchParams({ strictness: "1" });
  if (options?.countryCode) params.append("country[]", options.countryCode.toUpperCase());
  const url = `https://ipqualityscore.com/api/json/phone/${apiKey}/${encodeURIComponent(phoneNumber)}?${params.toString()}`;
  const { data } = await axios.get<IPQSPhoneResult>(url, { timeout: 15_000 });
  return data;
}
