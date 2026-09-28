import { ApiError } from "../api/client";

/**
 * Public-IP discovery for the mobile app.
 *
 * IPAPI remains the preferred source, but some mobile carriers, DNS resolvers,
 * firewalls and captive networks can block api.ipapi.is. Public-IP discovery
 * therefore uses a short, ordered fallback chain. No IPAPI secret key is used
 * by the Expo app; the authenticated IPAPI security lookup stays server-side.
 */
export const IPAPI_ENDPOINT = "https://api.ipapi.is";

const REQUEST_TIMEOUT_MS = 4_000;

type PublicIpResponse = { ip?: unknown; error?: unknown; error_code?: unknown };

const PUBLIC_IP_SOURCES = [
  {
    name: "IPAPI",
    url: "https://api.ipapi.is/",
    parse: async (response: Response) => {
      const payload = (await response.json().catch(() => null)) as PublicIpResponse | null;
      return typeof payload?.ip === "string" ? payload.ip : null;
    },
  },
  {
    name: "IPAPI regional",
    url: "https://us.ipapi.is/",
    parse: async (response: Response) => {
      const payload = (await response.json().catch(() => null)) as PublicIpResponse | null;
      return typeof payload?.ip === "string" ? payload.ip : null;
    },
  },
  {
    name: "IPify",
    url: "https://api64.ipify.org?format=json",
    parse: async (response: Response) => {
      const payload = (await response.json().catch(() => null)) as PublicIpResponse | null;
      return typeof payload?.ip === "string" ? payload.ip : null;
    },
  },
  {
    name: "IPify IPv4",
    url: "https://api.ipify.org?format=json",
    parse: async (response: Response) => {
      const payload = (await response.json().catch(() => null)) as PublicIpResponse | null;
      return typeof payload?.ip === "string" ? payload.ip : null;
    },
  },
  {
    name: "Cloudflare trace",
    url: "https://1.1.1.1/cdn-cgi/trace",
    parse: async (response: Response) => {
      const text = await response.text();
      const match = text.match(/(?:^|\n)ip=([^\n\r]+)/);
      return match?.[1]?.trim() || null;
    },
  },
  {
    name: "icanhazip",
    url: "https://icanhazip.com/",
    parse: async (response: Response) => {
      const value = (await response.text()).trim();
      return value || null;
    },
  },
] as const;

function looksLikeIp(value: string): boolean {
  const candidate = value.trim().replace(/^\[|\]$/g, "");
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(candidate);
  const ipv6 = candidate.includes(":") && /^[0-9a-f:.]+$/i.test(candidate);
  if (!ipv4 && !ipv6) return false;
  if (ipv4) return candidate.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
  return true;
}

async function requestSource(source: (typeof PUBLIC_IP_SOURCES)[number]): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(source.url, {
      method: "GET",
      headers: { Accept: "application/json,text/plain,*/*" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${source.name} returned HTTP ${response.status}`);
    }

    const ip = (await source.parse(response))?.trim();
    if (!ip || !looksLikeIp(ip)) {
      throw new Error(`${source.name} returned an invalid public IP`);
    }

    return ip;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getPublicIp(): Promise<string> {
  const failures: string[] = [];

  for (const source of PUBLIC_IP_SOURCES) {
    try {
      return await requestSource(source);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : `${source.name} request failed`;
      failures.push(message);
    }
  }

  throw new ApiError(
    "ReDom could not determine your public IP address. All public-IP discovery services were unreachable. Check your Internet connection and try again.",
    503,
    "PUBLIC_IP_ALL_SOURCES_FAILED",
    { failures },
  );
}
