import { Router } from "express";

import { commentController } from "../controllers/comment.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";

const router = Router();

router.use(authMiddleware, authRateLimit);

router.get("/post/:postId", commentController.list.bind(commentController));
router.post("/post/:postId", commentController.create.bind(commentController));
router.post("/:commentId/reaction", commentController.react.bind(commentController));
router.post("/:commentId/pin", commentController.pin.bind(commentController));
router.patch("/:commentId", commentController.edit.bind(commentController));
router.delete("/:commentId", commentController.remove.bind(commentController));
router.post("/:commentId/share", commentController.share.bind(commentController));

export default router;
