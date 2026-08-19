import { Router } from "express";

import {
  authController,
} from "../controllers/auth.controller";

import {
  authMiddleware,
} from "../middleware/auth.middleware";

import {
  authRateLimit,
  verificationRateLimit,
} from "../middleware/rate-limit.middleware";

const router =
  Router();

/**
 * Register
 */
router.post(
  "/register",
  authRateLimit,
  authController.register.bind(
    authController,
  ),
);

/**
 * Login
 */
router.post(
  "/login",
  authRateLimit,
  authController.login.bind(
    authController,
  ),
);

/**
 * Verify Email
 */
router.post(
  "/verify-email",
  verificationRateLimit,
  authController.verifyEmail.bind(
    authController,
  ),
);

/**
 * Verify Phone
 */
router.post(
  "/verify-phone",
  verificationRateLimit,
  authController.verifyPhone.bind(
    authController,
  ),
);

/**
 * Resend Email Verification
 */
router.post(
  "/resend-email-code",
  verificationRateLimit,
  authController.resendEmailCode.bind(
    authController,
  ),
);

/**
 * Resend Phone Verification
 */
router.post(
  "/resend-phone-code",
  verificationRateLimit,
  authController.resendPhoneCode.bind(
    authController,
  ),
);

/**
 * Forgot Password
 */
router.post(
  "/forgot-password",
  authRateLimit,
  authController.forgotPassword.bind(
    authController,
  ),
);

/**
 * Reset Password
 */
router.post(
  "/reset-password",
  authRateLimit,
  authController.resetPassword.bind(
    authController,
  ),
);

/**
 * Logout current authenticated session
 */
router.post(
  "/logout",
  authMiddleware,
  authController.logout.bind(
    authController,
  ),
);

/**
 * Refresh authentication session
 */
router.post(
  "/refresh",
  authRateLimit,
  authController.refreshSession.bind(
    authController,
  ),
);

export default router;