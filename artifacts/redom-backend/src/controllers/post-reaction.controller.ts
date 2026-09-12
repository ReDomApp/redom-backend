import { Request, Response } from "express";
import { z } from "zod";

import { postReactionService, POST_REACTION_TYPES } from "../services/feed/post-reaction.service";

const bodySchema = z.object({
  postId: z.string().uuid(),
  reactionType: z.enum(POST_REACTION_TYPES),
});

export class PostReactionController {
  async react(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
      }
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: "A valid postId and reactionType are required." });
        return;
      }
      const summary = await postReactionService.react(req.user.userId, parsed.data.postId, parsed.data.reactionType);
      res.status(200).json({ success: true, ...summary });
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to update reaction." });
    }
  }

  async summary(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
      }
      const postId = typeof req.params.postId === "string" ? req.params.postId : "";
      if (!z.string().uuid().safeParse(postId).success) {
        res.status(400).json({ success: false, message: "A valid postId is required." });
        return;
      }
      const summary = await postReactionService.getSummary(req.user.userId, postId);
      res.status(200).json({ success: true, ...summary });
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to load reactions." });
    }
  }
}

export const postReactionController = new PostReactionController();
