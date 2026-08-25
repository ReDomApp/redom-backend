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
      /*
       * req.ip comes from the server-side
       * Express request. The mobile client
       * cannot choose the IP used here.
       */
      const result =
        await getNetworkProvider(
          req.ip,
        );

      res.status(200).json(
        result,
      );
    } catch {
      /*
       * Network-provider detection must never
       * prevent the Login screen from loading.
       */
      res.status(200).json({
        success: false,
        networkProvider: null,
      });
    }
  }
}

export const networkProviderController =
  new NetworkProviderController();