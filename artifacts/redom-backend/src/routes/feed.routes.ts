import { Router } from "express";
import { z } from "zod";

import { homeFeedController } from "../controllers/home-feed.controller";
import { postFeedActionController } from "../controllers/post-feed-action.controller";
import { postReactionController } from "../controllers/post-reaction.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { postViewService } from "../services/feed/post-view.service";

const router = Router();

router.get("/home", authMiddleware, authRateLimit, homeFeedController.home.bind(homeFeedController));

router.post("/post-view", authMiddleware, authRateLimit, async (req, res) => {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }
    const parsed = z.object({ postId: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "A valid postId is required." });
      return;
    }
    const result = await postViewService.recordUniqueView(req.user.userId, parsed.data.postId);
    if (!result.found) {
      res.status(404).json({ success: false, message: "Post not found." });
      return;
    }
    res.status(200).json({ success: true, counted: result.counted, viewCountForRecommendation: 1 });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unable to record post view." });
  }
});

router.post("/post-reaction", authMiddleware, authRateLimit, postReactionController.react.bind(postReactionController));
router.get("/post-reaction/:postId", authMiddleware, authRateLimit, postReactionController.summary.bind(postReactionController));
router.post("/post-hide", authMiddleware, authRateLimit, postFeedActionController.hide.bind(postFeedActionController));
router.post("/post-unhide", authMiddleware, authRateLimit, postFeedActionController.unhide.bind(postFeedActionController));
router.get("/post-following", authMiddleware, authRateLimit, postFeedActionController.following.bind(postFeedActionController));
router.post("/post-unfollow", authMiddleware, authRateLimit, postFeedActionController.unfollow.bind(postFeedActionController));

export default router;
