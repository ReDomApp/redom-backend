import {
  lookup,
} from "../../lib/maxmind";

export interface NetworkProviderResult {
  success: boolean;
  networkProvider: string | null;
}

export async function getNetworkProvider(
  ip: string | undefined,
): Promise<NetworkProviderResult> {
  if (!ip) {
    return {
      success: false,
      networkProvider: null,
    };
  }

  const result =
    await lookup(ip);

  if (!result) {
    return {
      success: false,
      networkProvider: null,
    };
  }

  /*
   * Prefer the actual ISP when MaxMind
   * supplies one.
   *
   * Otherwise use the ASN organization.
   */
  const networkProvider =
    result.isp ??
    result.asOrganization ??
    null;

  return {
    success:
      Boolean(networkProvider),

    networkProvider,
  };
}