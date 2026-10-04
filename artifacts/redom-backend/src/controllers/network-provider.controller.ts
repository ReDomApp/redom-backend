import { isIP } from "node:net";
import { Request, Response } from "express";

import { getNetworkProvider } from "../services/auth/network-provider.service";

function normalizeIp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const valueTrimmed = value.trim().replace(/^\[|\]$/g, "");
  if (!valueTrimmed || isIP(valueTrimmed) === 0) return undefined;
  return valueTrimmed.startsWith("::ffff:") ? valueTrimmed.slice(7) : valueTrimmed;
}

function isUsablePublicIp(ip: string): boolean {
  const value = ip.trim();
  if (value.includes(":")) {
    const lower = value.toLowerCase();
    return lower !== "::" && lower !== "::1" &&
      !lower.startsWith("fc") && !lower.startsWith("fd") &&
      !lower.startsWith("fe8") && !lower.startsWith("fe9") &&
      !lower.startsWith("fea") && !lower.startsWith("feb");
  }

  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;

  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

/**
 * Web requests reach the API directly, so Express' trusted-proxy configuration
 * can resolve the browser's client IP with req.ip. Mobile may still provide
 * its independently discovered public IP as ?ip=..., which remains preferred.
 *
 * Never use an arbitrary hosting-server address as the client's network.
 */
function requestAddress(req: Request): string | undefined {
  const discoveredPublicIp = normalizeIp(req.query.ip);
  if (discoveredPublicIp && isUsablePublicIp(discoveredPublicIp)) return discoveredPublicIp;

  const trustedClientIp = normalizeIp(req.ip);
  if (trustedClientIp && isUsablePublicIp(trustedClientIp)) return trustedClientIp;

  return undefined;
}

export class NetworkProviderController {
  async get(req: Request, res: Response): Promise<void> {
    const ip = requestAddress(req);

    if (!ip) {
      const warning = "Unable to determine a usable public IP address from the current client network. The hosting server IP is never used for this check.";
      res.status(200).json({
        success: false,
        code: "NETWORK_IP_UNAVAILABLE",
        networkProvider: null,
        termsUrl: null,
        termsLabel: null,
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
        termsLabel: null,
        security: null,
        warning,
        message: warning,
      });
    }
  }
}

export const networkProviderController = new NetworkProviderController();
