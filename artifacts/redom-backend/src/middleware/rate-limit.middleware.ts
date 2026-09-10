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
 * Authentication rate limiter.
 *
 * Register
 * Login
 * Forgot Password
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
 * Verification code limiter.
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
