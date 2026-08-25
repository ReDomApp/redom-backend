/**
 * ReDom MaxMind GeoLite integration.
 *
 * Server-side only.
 *
 * Provides:
 * - Country
 * - Region / State
 * - City
 * - Postal code
 * - Timezone
 * - Latitude / longitude
 * - Accuracy radius
 * - ASN
 * - ASN organization
 * - ISP when supplied by the configured MaxMind service
 * - Network
 *
 * IMPORTANT:
 * MaxMind credentials MUST come from environment variables.
 *
 * MAXMIND_ACCOUNT_ID
 * MAXMIND_LICENSE_KEY
 *
 * Default service:
 *   GeoLite web service
 *
 * Default host:
 *   geolite.info
 *
 * A paid GeoIP service can be selected later with:
 *
 * MAXMIND_HOST=geoip.maxmind.com
 *
 * This module does not expose credentials to the frontend.
 */

import {
  isIP,
} from "node:net";

const DEFAULT_HOST =
  "geolite.info";

const DEFAULT_TIMEOUT_MS =
  5_000;

const CACHE_TTL_MS =
  5 * 60 * 1000;

interface MaxMindNameMap {
  en?: string;
  [locale: string]: string | undefined;
}

interface MaxMindCountry {
  iso_code?: string;
  names?: MaxMindNameMap;
}

interface MaxMindSubdivision {
  iso_code?: string;
  names?: MaxMindNameMap;
}

interface MaxMindCity {
  geoname_id?: number;
  names?: MaxMindNameMap;
}

interface MaxMindLocation {
  accuracy_radius?: number;
  latitude?: number;
  longitude?: number;
  time_zone?: string;
}

interface MaxMindPostal {
  code?: string;
}

interface MaxMindTraits {
  autonomous_system_number?: number;
  autonomous_system_organization?: string;
  connection_type?: string;
  domain?: string;
  ip_address?: string;
  isp?: string;
  mobile_country_code?: string;
  mobile_network_code?: string;
  organization?: string;
  network?: string;

  /*
   * These fields may be returned by paid
   * MaxMind services but are not guaranteed
   * by GeoLite.
   */
  is_anonymous?: boolean;
  is_anonymous_vpn?: boolean;
  is_anycast?: boolean;
  is_hosting_provider?: boolean;
  is_public_proxy?: boolean;
  is_residential_proxy?: boolean;
  is_tor_exit_node?: boolean;
}

interface MaxMindResponse {
  country?: MaxMindCountry;

  subdivisions?: MaxMindSubdivision[];

  city?: MaxMindCity;

  location?: MaxMindLocation;

  postal?: MaxMindPostal;

  traits?: MaxMindTraits;
}

export interface MaxMindLookupResult {
  ip: string;

  country: {
    code: string | null;
    name: string | null;
  };

  region: {
    code: string | null;
    name: string | null;
  };

  city: string | null;

  postalCode: string | null;

  timezone: string | null;

  latitude: number | null;

  longitude: number | null;

  accuracyRadiusKm: number | null;

  asn: number | null;

  asOrganization: string | null;

  /*
   * ISP is available when the configured
   * MaxMind product provides it.
   *
   * GeoLite City normally provides ASN/AS
   * organization rather than the paid ISP field.
   */
  isp: string | null;

  /*
   * Useful display fallback for network
   * provider terminology.
   *
   * Priority:
   *
   * ISP
   * ↓
   * AS organization
   */
  networkProvider: string | null;

  connectionType: string | null;

  network: string | null;

  domain: string | null;

  mobileCountryCode: string | null;

  mobileNetworkCode: string | null;

  /*
   * These are optional because GeoLite does
   * not provide the full paid anonymizer data.
   */
  isAnonymous: boolean | null;

  isAnonymousVpn: boolean | null;

  isAnycast: boolean | null;

  isHostingProvider: boolean | null;

  isPublicProxy: boolean | null;

  isResidentialProxy: boolean | null;

  isTorExitNode: boolean | null;

  source: "maxmind";

  lookedUpAt: string;
}

interface CacheEntry {
  expiresAt: number;
  result: MaxMindLookupResult;
}

const cache =
  new Map<string, CacheEntry>();

let warnedMissingCredentials =
  false;

function getCredentials(): {
  accountId: string;
  licenseKey: string;
} | null {
  const accountId =
    process.env.MAXMIND_ACCOUNT_ID?.trim();

  const licenseKey =
    process.env.MAXMIND_LICENSE_KEY?.trim();

  if (!accountId || !licenseKey) {
    if (!warnedMissingCredentials) {
      warnedMissingCredentials = true;

      console.warn(
        "[MaxMind] MAXMIND_ACCOUNT_ID or MAXMIND_LICENSE_KEY is not configured.",
      );
    }

    return null;
  }

  return {
    accountId,
    licenseKey,
  };
}

function getHost(): string {
  const configured =
    process.env.MAXMIND_HOST?.trim();

  if (!configured) {
    return DEFAULT_HOST;
  }

  return configured
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function getTimeout(): number {
  const configured =
    Number(
      process.env.MAXMIND_TIMEOUT_MS,
    );

  if (
    Number.isFinite(configured) &&
    configured >= 500 &&
    configured <= 30_000
  ) {
    return configured;
  }

  return DEFAULT_TIMEOUT_MS;
}

function getEnglishName(
  names?: MaxMindNameMap,
): string | null {
  if (!names) {
    return null;
  }

  return (
    names.en ??
    Object.values(names).find(
      (
        value,
      ) =>
        typeof value ===
        "string" &&
        value.length > 0,
    ) ??
    null
  );
}

function nullableString(
  value:
    | string
    | undefined,
): string | null {
  if (
    typeof value !==
      "string" ||
    value.length === 0
  ) {
    return null;
  }

  return value;
}

function nullableNumber(
  value:
    | number
    | undefined,
): number | null {
  return typeof value ===
    "number" &&
    Number.isFinite(value)
    ? value
    : null;
}

function nullableBoolean(
  value:
    | boolean
    | undefined,
): boolean | null {
  return typeof value ===
    "boolean"
    ? value
    : null;
}

function normalizeIp(
  ip: string,
): string {
  /*
   * Express/proxy environments can sometimes
   * provide IPv4-mapped IPv6 addresses such as:
   *
   * ::ffff:192.0.2.1
   *
   * MaxMind accepts IPv6, but normalizing this
   * makes cache keys and logs cleaner.
   */
  const trimmed =
    ip.trim();

  if (
    trimmed.startsWith(
      "::ffff:",
    )
  ) {
    const mapped =
      trimmed.slice(7);

    if (isIP(mapped) === 4) {
      return mapped;
    }
  }

  return trimmed;
}

function assertValidIp(
  ip: string,
): string {
  const normalized =
    normalizeIp(ip);

  if (
    isIP(normalized) === 0
  ) {
    throw new Error(
      "Invalid IP address supplied to MaxMind.",
    );
  }

  return normalized;
}

function buildUrl(
  host: string,
  ip: string,
): string {
  /*
   * Encode the IP because IPv6 addresses
   * contain ':' characters.
   */
  return `https://${host}/geoip/v2.1/city/${encodeURIComponent(ip)}`;
}

function buildResult(
  ip: string,
  response: MaxMindResponse,
): MaxMindLookupResult {
  const traits =
    response.traits;

  const country =
    response.country;

  const subdivision =
    response.subdivisions?.[0];

  const city =
    response.city;

  const location =
    response.location;

  const postal =
    response.postal;

  const isp =
    nullableString(
      traits?.isp,
    );

  const asOrganization =
    nullableString(
      traits?.autonomous_system_organization,
    );

  return {
    ip,

    country: {
      code:
        nullableString(
          country?.iso_code,
        ),

      name:
        getEnglishName(
          country?.names,
        ),
    },

    region: {
      code:
        nullableString(
          subdivision?.iso_code,
        ),

      name:
        getEnglishName(
          subdivision?.names,
        ),
    },

    city:
      getEnglishName(
        city?.names,
      ),

    postalCode:
      nullableString(
        postal?.code,
      ),

    timezone:
      nullableString(
        location?.time_zone,
      ),

    latitude:
      nullableNumber(
        location?.latitude,
      ),

    longitude:
      nullableNumber(
        location?.longitude,
      ),

    accuracyRadiusKm:
      nullableNumber(
        location?.accuracy_radius,
      ),

    asn:
      nullableNumber(
        traits?.autonomous_system_number,
      ),

    asOrganization,

    isp,

    /*
     * For GeoLite, AS organization is the
     * useful network/provider fallback.
     *
     * For a paid product that supplies ISP,
     * the actual ISP takes priority.
     */
    networkProvider:
      isp ??
      asOrganization,

    connectionType:
      nullableString(
        traits?.connection_type,
      ),

    network:
      nullableString(
        traits?.network,
      ),

    domain:
      nullableString(
        traits?.domain,
      ),

    mobileCountryCode:
      nullableString(
        traits?.mobile_country_code,
      ),

    mobileNetworkCode:
      nullableString(
        traits?.mobile_network_code,
      ),

    isAnonymous:
      nullableBoolean(
        traits?.is_anonymous,
      ),

    isAnonymousVpn:
      nullableBoolean(
        traits?.is_anonymous_vpn,
      ),

    isAnycast:
      nullableBoolean(
        traits?.is_anycast,
      ),

    isHostingProvider:
      nullableBoolean(
        traits?.is_hosting_provider,
      ),

    isPublicProxy:
      nullableBoolean(
        traits?.is_public_proxy,
      ),

    isResidentialProxy:
      nullableBoolean(
        traits?.is_residential_proxy,
      ),

    isTorExitNode:
      nullableBoolean(
        traits?.is_tor_exit_node,
      ),

    source: "maxmind",

    lookedUpAt:
      new Date().toISOString(),
  };
}

/**
 * Look up an IP address using the MaxMind
 * GeoLite/GeoIP City web service.
 *
 * This is asynchronous because the web-service
 * lookup is an HTTP request.
 */
export async function lookup(
  ip: string,
): Promise<
  MaxMindLookupResult | null
> {
  const normalizedIp =
    assertValidIp(ip);

  const cached =
    cache.get(
      normalizedIp,
    );

  if (
    cached &&
    cached.expiresAt >
      Date.now()
  ) {
    return cached.result;
  }

  /*
   * Remove expired cache entry.
   */
  if (cached) {
    cache.delete(
      normalizedIp,
    );
  }

  const credentials =
    getCredentials();

  if (!credentials) {
    return null;
  }

  const host =
    getHost();

  const url =
    buildUrl(
      host,
      normalizedIp,
    );

  const authorization =
    Buffer.from(
      `${credentials.accountId}:${credentials.licenseKey}`,
    ).toString(
      "base64",
    );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(() => {
      controller.abort();
    }, getTimeout());

  try {
    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {
            Authorization:
              `Basic ${authorization}`,

            Accept:
              "application/json",
          },

          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      let detail =
        `HTTP ${response.status}`;

      try {
        const body =
          await response.json() as {
            code?: string;
            error?: string;
          };

        if (
          body.error
        ) {
          detail =
            `${detail}: ${body.error}`;
        }
      } catch {
        /*
         * Keep the HTTP status when
         * MaxMind doesn't return JSON.
         */
      }

      throw new Error(
        `[MaxMind] ${detail}`,
      );
    }

    const body =
      await response.json() as MaxMindResponse;

    const result =
      buildResult(
        normalizedIp,
        body,
      );

    cache.set(
      normalizedIp,
      {
        expiresAt:
          Date.now() +
          CACHE_TTL_MS,

        result,
      },
    );

    return result;
  } catch (error) {
    if (
      error instanceof
      Error
    ) {
      if (
        error.name ===
        "AbortError"
      ) {
        console.warn(
          `[MaxMind] Lookup timed out for ${normalizedIp}.`,
        );
      } else {
        console.warn(
          `[MaxMind] Lookup failed for ${normalizedIp}: ${error.message}`,
        );
      }
    } else {
      console.warn(
        `[MaxMind] Lookup failed for ${normalizedIp}.`,
      );
    }

    /*
     * A GeoIP service failure should not itself
     * become a login failure.
     *
     * Security decisions should combine this
     * information with the dedicated fraud
     * provider and the existing ReDom security
     * controls.
     */
    return null;
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

/**
 * Convenience helper for applications that
 * want to explicitly request the network
 * provider name.
 *
 * Returns:
 *
 * ISP
 * ↓
 * ASN organization
 * ↓
 * null
 */
export async function getNetworkProvider(
  ip: string,
): Promise<
  string | null
> {
  const result =
    await lookup(ip);

  return (
    result?.networkProvider ??
    null
  );
}

/**
 * Clear the in-memory lookup cache.
 *
 * Useful for tests or controlled runtime
 * maintenance.
 */
export function clearCache(): void {
  cache.clear();
}