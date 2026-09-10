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
  egress_service?: {
    type?: string | null;
    provider?: string | null;
  } | null;
  is_crawler?: boolean | string | null;
  is_datacenter?: boolean | null;
  is_tor?: boolean | null;
  is_proxy?: boolean | null;
  is_vpn?: boolean | null;
  is_abuser?: boolean | null;
  elapsed_ms?: number | null;
  vpn?: {
    ip?: string | null;
    service?: string | null;
    url?: string | null;
    type?: string | null;
    last_seen?: number | null;
    last_seen_str?: string | null;
    exit_node_region?: string | null;
    country_code?: string | null;
    city_name?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  datacenter?: {
    datacenter?: string | null;
    domain?: string | null;
    network?: string | null;
    region?: string | null;
    service?: string | null;
    network_border_group?: string | null;
    code?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  } | null;
  company?: {
    name?: string | null;
    abuser_score?: string | null;
    domain?: string | null;
    type?: string | null;
    network?: string | null;
    netname?: string | null;
  } | null;
  abuse?: {
    name?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  asn?: {
    asn?: number | null;
    abuser_score?: string | null;
    route?: string | null;
    descr?: string | null;
    country?: string | null;
    active?: boolean | null;
    org?: string | null;
    domain?: string | null;
    abuse?: string | null;
    type?: string | null;
    created?: string | null;
    updated?: string | null;
    rir?: string | null;
  } | null;
  location?: {
    is_eu_member?: boolean | null;
    calling_code?: string | null;
    currency_code?: string | null;
    continent?: string | null;
    country?: string | null;
    country_code?: string | null;
    state?: string | null;
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    zip?: string | null;
    timezone?: string | null;
    local_time?: string | null;
    local_time_unix?: number | null;
    is_dst?: boolean | null;
    utcoffset?: string | null;
    accuracy?: "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW" | null;
    geofeed?: string[];
  } | null;

  // Compatibility fields consumed by the existing ReDom security layer.
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
  request_id?: string;
}

function parseAbuserScore(value?: string | null): number {
  if (!value) return 0;
  const match = value.match(/^\s*(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const score = Number(match[1]);
  return Number.isFinite(score) ? Math.min(100, Math.max(0, score * 100)) : 0;
}

/**
 * ReDom IP/network intelligence provider.
 *
 * IPQS is no longer used for IP security. ipapi.is supplies the complete
 * keyed response, including hosting/datacenter, VPN, proxy, Tor, crawler,
 * abuse, ASN, company and geolocation intelligence.
 */
export async function checkIP(ip: string): Promise<IPAPIResult> {
  const { data } = await axios.get<IPAPIResult>("https://api.ipapi.is", {
    params: { q: ip, key: env.ipApi.apiKey },
    timeout: 10_000,
    validateStatus: () => true,
  });

  if (!data || typeof data !== "object") {
    throw new Error("IPAPI returned an invalid response.");
  }

  const errorCode = (data as unknown as { error_code?: unknown }).error_code;
  const errorMessage = (data as unknown as { error?: unknown }).error;
  if (typeof errorCode === "string" || typeof errorMessage === "string") {
    throw new Error("IP security provider is temporarily unavailable.");
  }

  const isAbuser = data.is_abuser === true;
  const companyScore = parseAbuserScore(data.company?.abuser_score);
  const asnScore = parseAbuserScore(data.asn?.abuser_score);

  // IPAPI does not expose IPQS's 0-100 fraud score. Preserve the existing
  // numeric field for the database/security layer using its actual abuse
  // signals: the explicit abuser verdict is treated as a hard 100 score;
  // otherwise the organization network score is retained when available.
  const fraudScore = isAbuser ? 100 : Math.max(companyScore, asnScore);
  const crawler = Boolean(data.is_crawler);

  return {
    ...data,
    success: true,
    fraud_score: fraudScore,
    proxy: data.is_proxy === true,
    vpn: Boolean(data.is_vpn),
    tor: data.is_tor === true,
    bot_status: crawler,
    hosting: data.is_datacenter === true,
    ISP: data.company?.name ?? undefined,
    organization: data.company?.name ?? data.asn?.org ?? undefined,
    ASN: data.asn?.asn ?? undefined,
    country_code: data.location?.country_code?.toUpperCase() || undefined,
    recent_abuse: isAbuser,
    active_vpn: Boolean(data.is_vpn),
    active_tor: data.is_tor === true,
  };
}
