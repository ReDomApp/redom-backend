import { isIP } from "node:net";
import { Request, Response } from "express";

import { getNetworkProvider } from "../services/auth/network-provider.service";

function normalizeIp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const ip = value.trim().replace(/^\[|\]$/g, "");
  if (!ip || isIP(ip) === 0) return undefined;
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

function clientIp(req: Request, suppliedIp?: string): string | undefined {
  // Startup first discovers the handset's public IP through ipapi.is, then
  // sends that exact address here. Keep req.ip as the server-side fallback.
  return normalizeIp(suppliedIp) ?? normalizeIp(req.ip);
}

export class NetworkProviderController {
  async get(req: Request, res: Response): Promise<void> {
    const requestedIp = typeof req.query.ip === "string" ? req.query.ip : undefined;
    const ip = clientIp(req, requestedIp);

    if (!ip) {
      res.status(503).json({
        success: false,
        networkProvider: null,
        termsUrl: null,
        security: null,
        warning: "Unable to determine the device public IP address.",
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
