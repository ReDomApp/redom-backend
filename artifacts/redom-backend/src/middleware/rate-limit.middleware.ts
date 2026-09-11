import rateLimit from "express-rate-limit";

/**
 * General API rate limiter.
 */
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

/**
 * Authentication rate limiter for completed-account authentication.
 * Registration has its own more generous limiter below because a single
 * registration legitimately performs many API calls while moving through
 * the registration screens.
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please wait before trying again.",
  },
});

/**
 * Registration-flow limiter.
 *
 * A registration is a multi-screen workflow and legitimately makes many
 * requests (flow reservation, memory, name, birthday, gender, phone/country,
 * security, email, password, completion, etc.). Do not make those calls share
 * the strict completed-account authentication limit.
 */
export const registrationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many registration requests. Please wait a moment before continuing.",
  },
});

/**
 * Registration verification/resend limiter.
 * Keep verification protected, but allow normal users to correct/retry codes
 * during a registration without exhausting the general authentication bucket.
 */
export const registrationVerificationRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many registration verification requests. Please wait before trying again.",
  },
});

/**
 * Startup network intelligence is not an authentication attempt.
 * Give the Startup screen enough room for retries while still preventing
 * accidental request loops from hammering the endpoint/IPAPI.
 */
export const networkProviderRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many network checks. Please wait before trying again.",
  },
});

/**
 * Verification code limiter for completed-account verification flows.
 */
export const verificationRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many verification requests. Please wait before requesting another code.",
  },
});

/**
 * Password reset limiter.
 */
export const passwordResetRateLimit = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password reset requests. Please try again later.",
  },
});
