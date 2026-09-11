import { Request, Response } from "express";

import { homeFeedService } from "../services/feed/home-feed.service";

export class HomeFeedController {
  async home(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
      }

      const result = await homeFeedService.generate({
        userId: req.user.userId,
        ipAddress: req.ip,
      });

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Unable to refresh Home Feed.",
      });
    }
  }
}

export const homeFeedController = new HomeFeedController();
