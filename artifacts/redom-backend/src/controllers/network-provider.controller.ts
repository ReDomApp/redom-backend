import { isIP } from "node:net";
import { Request, Response } from "express";

import { getNetworkProvider } from "../services/auth/network-provider.service";

function normalizeIp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const valueTrimmed = value.trim().replace(/^\[|\]$/g, "");
  if (!valueTrimmed || isIP(valueTrimmed) === 0) return undefined;
  return valueTrimmed.startsWith("::ffff:") ? valueTrimmed.slice(7) : valueTrimmed;
}

/**
 * The mobile app first asks api.ipapi.is for the public IP visible from the
 * handset's current Wi-Fi/mobile connection, then sends that IP here.
 *
 * The handset-discovered public IP is authoritative for network intelligence.
 * Render sits behind managed proxies, so req.ip is useful as an observation
 * but must not replace the public IP discovered directly from the handset.
 */
function requestAddress(req: Request): string | undefined {
  const discoveredPublicIp = normalizeIp(req.query.ip);
  if (discoveredPublicIp) return discoveredPublicIp;

  return normalizeIp(req.ip);
}

export class NetworkProviderController {
  async get(req: Request, res: Response): Promise<void> {
    const ip = requestAddress(req);

    if (!ip) {
      const warning = "Unable to determine the public IP address of the current network.";
      res.status(503).json({
        success: false,
        code: "NETWORK_IP_UNAVAILABLE",
        networkProvider: null,
        termsUrl: null,
        security: null,
        warning,
        message: warning,
      });
      return;
    }

    try {
      res.status(200).json(await getNetworkProvider(ip));
    } catch (error) {
      const warning = error instanceof Error ? error.message : "IPAPI network lookup failed.";
      res.status(502).json({
        success: false,
        code: "IPAPI_LOOKUP_FAILED",
        networkProvider: null,
        termsUrl: null,
        security: null,
        warning,
        message: warning,
      });
    }
  }
}

export const networkProviderController = new NetworkProviderController();
