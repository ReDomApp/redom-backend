import { Request, Response } from "express";
import { z } from "zod";

import { NOT_INTERESTED_REASONS, postFeedActionService } from "../services/feed/post-feed-action.service";

const hideSchema = z.object({
  postId: z.string().uuid(),
  reason: z.enum(NOT_INTERESTED_REASONS),
});

const postSchema = z.object({ postId: z.string().uuid() });
const creatorSchema = z.object({ creatorUserId: z.string().uuid() });

export class PostFeedActionController {
  async hide(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
      const parsed = hideSchema.safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ success: false, message: "A valid postId and reason are required." });
      const result = await postFeedActionService.hidePost(req.user.userId, parsed.data.postId, parsed.data.reason);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to hide post." });
    }
  }

  async unhide(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
      const parsed = postSchema.safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ success: false, message: "A valid postId is required." });
      const result = await postFeedActionService.unhidePost(req.user.userId, parsed.data.postId);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to unhide post." });
    }
  }

  async following(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
      const parsed = creatorSchema.safeParse(req.query);
      if (!parsed.success) return void res.status(400).json({ success: false, message: "A valid creatorUserId is required." });
      res.status(200).json({ success: true, following: await postFeedActionService.getFollowingState(req.user.userId, parsed.data.creatorUserId) });
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to load following state." });
    }
  }

  async unfollow(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
      const parsed = creatorSchema.safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ success: false, message: "A valid creatorUserId is required." });
      const result = await postFeedActionService.unfollowCreator(req.user.userId, parsed.data.creatorUserId);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to unfollow creator." });
    }
  }
}

export const postFeedActionController = new PostFeedActionController();
