import {
  Router,
} from "express";

import {
  authController,
} from "../controllers/auth.controller";

import {
  networkProviderController,
} from "../controllers/network-provider.controller";

import {
  authMiddleware,
} from "../middleware/auth.middleware";

import {
  authRateLimit,
  passwordResetRateLimit,
  verificationRateLimit,
} from "../middleware/rate-limit.middleware";

const router =
  Router();

/*
 * ----------------------------------------------------------
 * NETWORK PROVIDER
 * ----------------------------------------------------------
 *
 * Public endpoint.
 *
 * Login has not happened yet, so this cannot
 * require authentication.
 *
 * The server determines the IP from req.ip.
 */
router.get(
  "/network-provider",
  authRateLimit,
  networkProviderController.get.bind(
    networkProviderController,
  ),
);

/*
 * ----------------------------------------------------------
 * AUTHENTICATION
 * ----------------------------------------------------------
 */

router.post(
  "/register",
  authRateLimit,
  authController.register.bind(
    authController,
  ),
);

router.post(
  "/login",
  authRateLimit,
  authController.login.bind(
    authController,
  ),
);

/*
 * New-device login verification.
 */
router.post(
  "/verify-login-device",
  verificationRateLimit,
  authController.verifyLoginDevice.bind(
    authController,
  ),
);

/*
 * Account verification.
 */
router.post(
  "/verify-email",
  verificationRateLimit,
  authController.verifyEmail.bind(
    authController,
  ),
);

router.post(
  "/verify-phone",
  verificationRateLimit,
  authController.verifyPhone.bind(
    authController,
  ),
);

router.post(
  "/resend-email-code",
  verificationRateLimit,
  authController.resendEmailCode.bind(
    authController,
  ),
);

router.post(
  "/resend-phone-code",
  verificationRateLimit,
  authController.resendPhoneCode.bind(
    authController,
  ),
);

/*
 * Password recovery.
 */
router.post(
  "/forgot-password",
  passwordResetRateLimit,
  authController.forgotPassword.bind(
    authController,
  ),
);

router.post(
  "/reset-password",
  passwordResetRateLimit,
  authController.resetPassword.bind(
    authController,
  ),
);

/*
 * Authenticated session operations.
 */
router.post(
  "/logout",
  authMiddleware,
  authController.logout.bind(
    authController,
  ),
);

router.post(
  "/refresh",
  authRateLimit,
  authController.refreshSession.bind(
    authController,
  ),
);

export default router;
