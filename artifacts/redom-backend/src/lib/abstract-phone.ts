import axios from "axios";

import { env } from "../config/env";

export interface AbstractPhoneResult {
  phone?: string;
  valid: boolean;
  format?: {
    international?: string;
    local?: string;
  };
  country?: {
    code?: string;
    name?: string;
    prefix?: string;
  };
  location?: string;
  type?: string;
  carrier?: string;
  risk_score?: number;
}

/**
 * Secondary phone-validation provider used only when IPQS itself is unavailable.
 * Abstract is not used to override a definitive IPQS validation result.
 */
export async function checkAbstractPhone(
  phoneNumber: string,
  options?: { countryCode?: string },
): Promise<AbstractPhoneResult> {
  const apiKey = env.abstract.apiKey;
  if (!apiKey) {
    throw new Error("ABSTRACT_API_KEY is not configured.");
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    phone: phoneNumber,
  });

  if (options?.countryCode) {
    params.set("country", options.countryCode.toUpperCase());
  }

  try {
    const { data } = await axios.get<AbstractPhoneResult>(
      "https://phonevalidation.abstractapi.com/v1/",
      {
        params,
        timeout: 15_000,
      },
    );

    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const code = error.code;
      throw new Error(
        `Abstract phone validation provider unavailable${status ? ` (HTTP ${status})` : code ? ` (${code})` : ""}.`,
      );
    }

    throw new Error("Abstract phone validation provider unavailable.");
  }
}

export function normalizeAbstractPhoneResult(
  result: AbstractPhoneResult,
  requestedCountryCode: string,
) {
  const countryCode = result.country?.code?.trim().toUpperCase() || null;
  const lineType = result.type?.trim() || null;
  const voip = Boolean(lineType && /voip/i.test(lineType));

  return {
    success: true,
    message: result.valid ? "Phone is valid." : "Invalid/nonexistent phone number.",
    formatted: result.format?.international || result.phone || "N/A",
    local_format: result.format?.local || "N/A",
    fraud_score: 0,
    valid: result.valid,
    active: null,
    VOIP: voip,
    prepaid: null,
    risky: null,
    recent_abuse: null,
    leaked: null,
    spammer: null,
    carrier: result.carrier || null,
    line_type: lineType,
    country: countryCode,
    country_code: countryCode,
    region: result.location || null,
    city: null,
    timezone: null,
    dialing_code: null,
    accurate_country_code:
      countryCode ? countryCode === requestedCountryCode.toUpperCase() : null,
    active_status: null,
    user_activity: null,
    request_id: null,
  };
}
