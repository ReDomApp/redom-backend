import {
  Request,
  Response,
} from "express";

import {
  getNetworkProvider,
} from "../services/auth/network-provider.service";

export class NetworkProviderController {
  async get(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const result =
        await getNetworkProvider(
          req.ip,
        );

      res.status(200).json(
        result,
      );
    } catch {
      res.status(200).json({
        success: false,
        networkProvider: null,
      });
    }
  }
}

export const networkProviderController =
  new NetworkProviderController();