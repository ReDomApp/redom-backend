import { Request, Response } from "express";

import { getNetworkProvider } from "../services/auth/network-provider.service";

export class NetworkProviderController {
  async get(req: Request, res: Response): Promise<void> {
    try {
      res.status(200).json(await getNetworkProvider(req.ip));
    } catch {
      res.status(200).json({
        success: false,
        networkProvider: null,
        termsUrl: null,
        security: null,
        warning: null,
      });
    }
  }
}

export const networkProviderController = new NetworkProviderController();