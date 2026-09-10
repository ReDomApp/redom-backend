import { isIP } from "node:net";
import { Request, Response } from "express";

import { getNetworkProvider } from "../services/auth/network-provider.service";

function normalizeIp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const valueTrimmed = value.trim().replace(/^\[|\]$/g, "");
  if (!valueTrimmed || isIP(valueTrimmed) === 0) return undefined;
  return valueTrimmed.startsWith("::ffff:") ? valueTrimmed.slice(7) : valueTrimmed;
}

function requestAddress(req: Request): string | undefined {
  return normalizeIp(req.ip);
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
