import { Router } from "express";

import { homeFeedController } from "../controllers/home-feed.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";

const router = Router();

router.get("/home", authMiddleware, authRateLimit, homeFeedController.home.bind(homeFeedController));

export default router;
