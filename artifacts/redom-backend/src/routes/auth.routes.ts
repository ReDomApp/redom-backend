import { Router } from "express";

import { authController } from "../controllers/auth.controller";

import {
  authRateLimit,
  verificationRateLimit,
} from "../middleware/rate-limit.middleware";

const router = Router();

/**
 * Register
 */
router.post(
  "/register",
  authRateLimit,
  authController.register.bind(authController),
);

/**
 * Login
 */
router.post(
  "/login",
  authRateLimit,
  authController.login.bind(authController),
);

/**
 * Verify Email
 */
router.post(
  "/verify-email",
  verificationRateLimit,
  authController.verifyEmail.bind(authController),
);

export default router;