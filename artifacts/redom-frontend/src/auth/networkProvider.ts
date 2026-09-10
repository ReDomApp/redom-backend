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

const emptyNetworkProvider = (warning: string | null = null): NetworkProviderResponse => ({
  success: false,
  networkProvider: null,
  termsUrl: null,
  security: null,
  warning,
});

let cached: NetworkProviderResponse = emptyNetworkProvider();
let loaded = false;

export async function fetchNetworkProvider(): Promise<NetworkProviderResponse> {
  loaded = false;

  try {
    // The backend derives the address from the actual request reaching ReDom.
    // No client-supplied address is accepted or sent to the backend.
    const result = await api.get<NetworkProviderResponse>("/auth/network-provider");

    cached = result.success && result.security
      ? result
      : emptyNetworkProvider(result.warning || "IPAPI could not complete the network security check.");
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : "We could not reach ReDom's network security service.";
    cached = emptyNetworkProvider(message);
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
  cached = emptyNetworkProvider();
  loaded = false;
}
