import { Router } from "express";

import { authController } from "../controllers/auth.controller";
import { networkProviderController } from "../controllers/network-provider.controller";
import { registrationChallengeController } from "../controllers/registration-challenge.controller";
import { registrationFlowController } from "../controllers/registration-flow.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit, passwordResetRateLimit, verificationRateLimit } from "../middleware/rate-limit.middleware";

const router = Router();

router.get("/network-provider", authRateLimit, networkProviderController.get.bind(networkProviderController));
router.post("/register", authRateLimit, authController.register.bind(authController));

/* Reserve the server-owned numeric Flow ID as soon as Create New Account is pressed. */
router.post("/register/flow", authRateLimit, registrationFlowController.reserve.bind(registrationFlowController));
router.patch("/register/flow/:reservationId/name", authRateLimit, registrationFlowController.saveName.bind(registrationFlowController));
router.patch("/register/flow/:reservationId/birthday", authRateLimit, registrationFlowController.saveBirthday.bind(registrationFlowController));
router.patch("/register/flow/:reservationId/gender", authRateLimit, registrationFlowController.saveGender.bind(registrationFlowController));
router.get("/register/flow/:reservationId/phone-country", authRateLimit, registrationFlowController.detectPhoneCountry.bind(registrationFlowController));
router.patch("/register/flow/:reservationId/phone", authRateLimit, registrationFlowController.savePhone.bind(registrationFlowController));

/* Multi-screen, server-owned registration flow. */
router.post("/register/challenge", authRateLimit, registrationChallengeController.start.bind(registrationChallengeController));
router.get("/register/challenge/:challengeId", authRateLimit, registrationChallengeController.getFlow.bind(registrationChallengeController));
router.patch("/register/challenge/:challengeId", authRateLimit, registrationChallengeController.saveStep.bind(registrationChallengeController));
router.post("/register/challenge/:challengeId/complete", authRateLimit, registrationChallengeController.complete.bind(registrationChallengeController));
router.post("/register/verification/:verificationChallengeId/verify", verificationRateLimit, registrationChallengeController.verify.bind(registrationChallengeController));

router.post("/login", authRateLimit, authController.login.bind(authController));
router.post("/verify-login-device", verificationRateLimit, authController.verifyLoginDevice.bind(authController));
router.post("/verify-email", verificationRateLimit, authController.verifyEmail.bind(authController));
router.post("/verify-phone", verificationRateLimit, authController.verifyPhone.bind(authController));
router.post("/resend-email-code", verificationRateLimit, authController.resendEmailCode.bind(authController));
router.post("/resend-phone-code", verificationRateLimit, authController.resendPhoneCode.bind(authController));
router.post("/forgot-password", passwordResetRateLimit, authController.forgotPassword.bind(authController));
router.post("/reset-password", passwordResetRateLimit, authController.resetPassword.bind(authController));
router.post("/logout", authMiddleware, authController.logout.bind(authController));
router.post("/refresh", authRateLimit, authController.refreshSession.bind(authController));

export default router;
