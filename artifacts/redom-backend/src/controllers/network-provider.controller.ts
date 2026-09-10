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
 * Keep the server-observed address as a consistency check. If the proxy's
 * client address and the handset-discovered public address agree, use it.
 * When they disagree, prefer the server-observed address rather than blindly
 * trusting a client-supplied value.
 */
function requestAddress(req: Request): string | undefined {
  const serverObservedIp = normalizeIp(req.ip);
  const discoveredPublicIp = normalizeIp(req.query.ip);

  if (serverObservedIp && discoveredPublicIp) {
    return serverObservedIp === discoveredPublicIp
      ? discoveredPublicIp
      : serverObservedIp;
  }

  return discoveredPublicIp ?? serverObservedIp;
}

export class NetworkProviderController {
  async get(req: Request, res: Response): Promise<void> {
    const ip = requestAddress(req);

    if (!ip) {
      res.status(503).json({
        success: false,
        networkProvider: null,
        termsUrl: null,
        security: null,
        warning: "Unable to determine the address of the current network request.",
      });
      return;
    }

    try {
      res.status(200).json(await getNetworkProvider(ip));
    } catch (error) {
      const message = error instanceof Error ? error.message : "IPAPI network lookup failed.";
      res.status(503).json({
        success: false,
        networkProvider: null,
        termsUrl: null,
        security: null,
        warning: message,
      });
    }
  }
}

export const networkProviderController = new NetworkProviderController();
