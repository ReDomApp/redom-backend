import { checkIP } from "../../lib/ipapi";

export interface NetworkSecurityResult {
  ip: string | null;
  connection: string;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  organization: string | null;
  companyType: string | null;
  asn: number | null;
  datacenter: string | null;
  vpnService: string | null;
  egressService: string | null;
  egressProvider: string | null;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  bot: boolean;
  abuser: boolean;
  mobile: boolean;
  satellite: boolean;
  fraudScore: number;
}

export interface NetworkProviderResult {
  success: boolean;
  networkProvider: string | null;
  termsUrl: string | null;
  security: NetworkSecurityResult | null;
  warning: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const resultCache = new Map<string, { expiresAt: number; result: NetworkProviderResult }>();

function connectionType(result: Awaited<ReturnType<typeof checkIP>>) {
  if (result.is_tor) return "Tor";
  if (result.is_vpn) return "VPN";
  if (result.is_proxy) return "Proxy";
  if (result.is_datacenter) return "Datacenter / Hosting";
  if (result.is_mobile) return "Mobile";
  if (result.is_satellite) return "Satellite";
  if (result.egress_service?.type) return result.egress_service.type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return result.company?.type ? result.company.type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Residential / ISP";
}

function officialProviderUrl(domain?: string | null) {
  const normalized = domain?.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return normalized ? `https://${normalized}` : null;
}

function warningFor(security: NetworkSecurityResult) {
  if (security.vpn) return "VPN detected. Your current connection appears to use a VPN provider.";
  if (security.proxy) return "Proxy detected. Your current connection appears to use a proxy.";
  if (security.tor) return "Tor detected. Your current connection appears to use Tor.";
  if (security.datacenter) return "Datacenter connection detected. Your current connection appears to come from a hosting or cloud network.";
  if (security.bot) return "Automated traffic detected. Your current connection was identified as crawler or automated traffic.";
  if (security.abuser || security.fraudScore >= 75) return `High security risk detected. This connection received a fraud-risk score of ${security.fraudScore}%.`;
  return null;
}

export async function getNetworkProvider(ip: string | undefined): Promise<NetworkProviderResult> {
  if (!ip) return { success: false, networkProvider: null, termsUrl: null, security: null, warning: null };

  const cacheKey = ip.trim();
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  if (cached) resultCache.delete(cacheKey);

  const result = await checkIP(cacheKey);
  const networkProvider = result.company?.name ?? result.asn?.org ?? null;
  const security: NetworkSecurityResult = {
    ip: result.ip ?? cacheKey,
    connection: connectionType(result),
    country: result.location?.country ?? null,
    countryCode: result.location?.country_code?.toUpperCase() ?? null,
    region: result.location?.state ?? null,
    city: result.location?.city ?? null,
    timezone: result.location?.timezone ?? null,
    organization: result.company?.name ?? result.asn?.org ?? null,
    companyType: result.company?.type ?? result.asn?.type ?? null,
    asn: result.asn?.asn ?? null,
    datacenter: result.datacenter?.datacenter ?? null,
    vpnService: result.vpn?.service ?? null,
    egressService: result.egress_service?.type ?? null,
    egressProvider: result.egress_service?.provider ?? null,
    proxy: result.is_proxy === true,
    vpn: result.is_vpn === true,
    tor: result.is_tor === true,
    bot: Boolean(result.is_crawler),
    abuser: result.is_abuser === true,
    mobile: result.is_mobile === true,
    satellite: result.is_satellite === true,
    fraudScore: Number(result.fraud_score ?? 0),
  };

  const providerDomain = result.company?.domain ?? result.asn?.domain ?? result.vpn?.url ?? null;
  const response: NetworkProviderResult = {
    success: true,
    networkProvider,
    termsUrl: officialProviderUrl(providerDomain),
    security,
    warning: warningFor(security),
  };

  resultCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, result: response });
  return response;
}
