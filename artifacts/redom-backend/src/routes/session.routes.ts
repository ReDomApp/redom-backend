import { Router } from "express";

import {
  sessionController,
} from "../controllers/session.controller";

import {
  authMiddleware,
} from "../middleware/auth.middleware";

const router =
  Router();

/**
 * Current active sessions
 */
router.get(
  "/",
  authMiddleware,
  sessionController.list.bind(
    sessionController,
  ),
);

/**
 * Revoke one owned session
 */
router.delete(
  "/:sessionId",
  authMiddleware,
  sessionController.revoke.bind(
    sessionController,
  ),
);

/**
 * Revoke every session owned
 * by the authenticated account
 */
router.post(
  "/revoke-all",
  authMiddleware,
  sessionController.revokeAll.bind(
    sessionController,
  ),
);

export default router;