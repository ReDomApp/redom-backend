import { Request, Response } from "express";

import { homeFeedService } from "../services/feed/home-feed.service";

export class HomeFeedController {
  async home(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
      }

      const rawPage = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;
      const parsedPage = rawPage === undefined ? 1 : Number.parseInt(String(rawPage), 10);
      const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

      const result = await homeFeedService.generate({
        userId: req.user.userId,
        ipAddress: req.ip,
        page,
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
