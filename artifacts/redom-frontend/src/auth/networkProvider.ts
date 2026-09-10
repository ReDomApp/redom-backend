import { api } from "../api/client";

export interface NetworkSecurity {
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

export interface NetworkProviderResponse {
  success: boolean;
  networkProvider: string | null;
  termsUrl: string | null;
  security: NetworkSecurity | null;
  warning: string | null;
}

let cached: NetworkProviderResponse = {
  success: false,
  networkProvider: null,
  termsUrl: null,
  security: null,
  warning: null,
};
let loaded = false;

export async function fetchNetworkProvider(): Promise<NetworkProviderResponse> {
  try {
    cached = await api.get<NetworkProviderResponse>("/auth/network-provider");
  } catch {
    cached = { success: false, networkProvider: null, termsUrl: null, security: null, warning: null };
  }
  loaded = true;
  return cached;
}

export function setNetworkProvider(provider: string | null): void {
  cached = { ...cached, networkProvider: provider };
  loaded = true;
}

export function getNetworkProvider(): string | null { return cached.networkProvider; }
export function getNetworkSecurity(): NetworkProviderResponse { return cached; }
export function hasLoadedNetworkProvider(): boolean { return loaded; }
export function clearNetworkProvider(): void {
  cached = { success: false, networkProvider: null, termsUrl: null, security: null, warning: null };
  loaded = false;
}
