import { isIP } from "node:net";
import axios from "axios";

import { env } from "../config/env";

export interface IPAPIResult {
  success: boolean;
  message?: string;
  ip?: string;
  rir?: string | null;
  is_bogon?: boolean | null;
  is_mobile?: boolean | null;
  is_satellite?: boolean | null;
  egress_service?: { type?: string | null; provider?: string | null } | null;
  is_crawler?: boolean | string | null;
  is_datacenter?: boolean | null;
  is_tor?: boolean | null;
  is_proxy?: boolean | null;
  is_vpn?: boolean | null;
  is_abuser?: boolean | null;
  elapsed_ms?: number | null;
  vpn?: { ip?: string | null; service?: string | null; url?: string | null; type?: string | null; last_seen?: number | null; last_seen_str?: string | null; exit_node_region?: string | null; country_code?: string | null; city_name?: string | null; latitude?: number | null; longitude?: number | null } | null;
  datacenter?: { datacenter?: string | null; domain?: string | null; network?: string | null; region?: string | null; service?: string | null; network_border_group?: string | null; code?: string | null; city?: string | null; state?: string | null; country?: string | null } | null;
  company?: { name?: string | null; abuser_score?: string | null; domain?: string | null; type?: string | null; network?: string | null; netname?: string | null } | null;
  abuse?: { name?: string | null; address?: string | null; email?: string | null; phone?: string | null } | null;
  asn?: { asn?: number | null; abuser_score?: string | null; route?: string | null; descr?: string | null; country?: string | null; active?: boolean | null; org?: string | null; domain?: string | null; abuse?: string | null; type?: string | null; created?: string | null; updated?: string | null; rir?: string | null } | null;
  location?: { is_eu_member?: boolean | null; calling_code?: string | null; currency_code?: string | null; continent?: string | null; country?: string | null; country_code?: string | null; state?: string | null; city?: string | null; latitude?: number | null; longitude?: number | null; zip?: string | null; timezone?: string | null; local_time?: string | null; local_time_unix?: number | null; is_dst?: boolean | null; utcoffset?: string | null; accuracy?: "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW" | null; geofeed?: string[] } | null;
  fraud_score: number;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  bot_status: boolean;
  hosting: boolean;
  ISP?: string;
  organization?: string;
  ASN?: number;
  country_code?: string;
  recent_abuse?: boolean;
  active_vpn?: boolean;
  active_tor?: boolean;
}

const IPAPI_ENDPOINT = "https://api.ipapi.is/";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_TRANSIENT_ATTEMPTS = 2;

function normalizeIp(ip: string): string {
  const value = ip.trim().replace(/^\[|\]$/g, "");
  if (!value || isIP(value) === 0) throw new Error("Invalid client IP address.");
  return value.startsWith("::ffff:") ? value.slice(7) : value;
}

function responseError(data: unknown, status: number, retryAfter?: string): Error {
  const body = (data && typeof data === "object" ? data : {}) as { error?: unknown; error_code?: unknown };
  const code = typeof body.error_code === "string" ? body.error_code : `HTTP_${status}`;
  const message = typeof body.error === "string" ? body.error : "IPAPI network lookup failed.";
  const retry = retryAfter ? ` Retry after ${retryAfter} seconds.` : "";
  return new Error(`IPAPI ${code}: ${message}.${retry}`.replace(/\.\./g, "."));
}

function isTransientAxiosError(error: unknown): boolean {
  return axios.isAxiosError(error) && (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT" || !error.response);
}

function parseAbuserScore(value?: string | null): number {
  if (!value) return 0;
  const match = value.match(/\d+(?:\.\d+)?/);
  if (!match) return 0;
  const raw = Number(match[0]);
  return Number.isFinite(raw) ? Math.min(100, Math.max(0, raw <= 1 ? raw * 100 : raw)) : 0;
}

/** Server-side IPAPI client. The API key never reaches the Expo bundle. */
export async function checkIP(ip: string): Promise<IPAPIResult> {
  const normalizedIp = normalizeIp(ip);
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
      const response = await axios.get<IPAPIResult>(IPAPI_ENDPOINT, {
        params: { q: normalizedIp, key: env.ipApi.apiKey },
        headers: { Accept: "application/json" },
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      });

      if (response.status < 200 || response.status >= 300) {
        const retryAfter = typeof response.headers["retry-after"] === "string" ? response.headers["retry-after"] : undefined;
        if (response.status >= 500 && response.status <= 599 && attempt < MAX_TRANSIENT_ATTEMPTS) {
          lastError = responseError(response.data, response.status, retryAfter);
          continue;
        }
        throw responseError(response.data, response.status, retryAfter);
      }

      const data = response.data;
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("IPAPI returned an invalid JSON response.");
      const errorCode = (data as unknown as { error_code?: unknown }).error_code;
      const errorMessage = (data as unknown as { error?: unknown }).error;
      if (typeof errorCode === "string" || typeof errorMessage === "string") throw responseError(data, response.status);

      const companyScore = parseAbuserScore(data.company?.abuser_score);
      const asnScore = parseAbuserScore(data.asn?.abuser_score);
      const fraudScore = Math.max(companyScore, asnScore);
      const crawler = Boolean(data.is_crawler);

      return {
        ...data,
        success: true,
        fraud_score: fraudScore,
        proxy: data.is_proxy === true,
        vpn: data.is_vpn === true,
        tor: data.is_tor === true,
        bot_status: crawler,
        hosting: data.is_datacenter === true,
        ISP: data.company?.name ?? undefined,
        organization: data.company?.name ?? data.asn?.org ?? undefined,
        ASN: data.asn?.asn ?? undefined,
        country_code: data.location?.country_code?.toUpperCase() || undefined,
        recent_abuse: data.is_abuser === true,
        active_vpn: data.is_vpn === true,
        active_tor: data.is_tor === true,
      };
    } catch (error) {
      lastError = error;
      if (!isTransientAxiosError(error) || attempt >= MAX_TRANSIENT_ATTEMPTS) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("IPAPI network lookup failed.");
}
