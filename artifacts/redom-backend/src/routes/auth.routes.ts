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
 *
 * The user is NOT authenticated yet.
 * The challenge ID proves which login attempt
 * is being completed.
 */
router.post(
  "/verify-login-device",
  verificationRateLimit,
  authController.verifyLoginDevice.bind(
    authController,
  ),
);

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

router.post(
  "/forgot-password",
  authRateLimit,
  authController.forgotPassword.bind(
    authController,
  ),
);

router.post(
  "/reset-password",
  authRateLimit,
  authController.resetPassword.bind(
    authController,
  ),
);

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