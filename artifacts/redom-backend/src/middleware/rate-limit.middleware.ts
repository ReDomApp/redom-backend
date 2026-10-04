import rateLimit from "express-rate-limit";

export function isMessagingPath(req: { path?: string; originalUrl?: string }): boolean {
  const value = `${req.path ?? ""} ${req.originalUrl ?? ""}`;
  return /\/(?:messages|message-reactions|calls)(?:\/|$)/.test(value) || /\/ai\/(?:chat|image|voice\/transcribe|feedback)(?:\/|\?|$)/.test(value);
}

/** Render/uptime health probes must never consume the public API request budget. */
export function isHealthCheckPath(req: { path?: string; originalUrl?: string }): boolean {
  const value = `${req.path ?? ""} ${req.originalUrl ?? ""}`.split("?")[0];
  return value === "/healthz" || value.endsWith("/healthz");
}

/** General API limiter; chat/messaging/interactive AI and health probes are excluded. */
export const apiRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, skip: (req) => isMessagingPath(req) || isHealthCheckPath(req), message: { success: false, message: "Too many requests. Please try again later." } });

/** Authentication limiter; chat/messaging/interactive AI is completely excluded. */
export const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, skip: (req) => isMessagingPath(req), message: { success: false, message: "Too many authentication attempts. Please wait before trying again." } });

/** Compatibility export: messaging has no rate limiter. */
export const messagingRateLimit = (_req: unknown, _res: unknown, next: () => void) => next();

export const registrationRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, message: { success: false, message: "Too many registration requests. Please wait a moment before continuing." } });
export const registrationVerificationRateLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, message: { success: false, message: "Too many registration verification requests. Please wait before trying again." } });
export const networkProviderRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, message: { success: false, message: "Too many network checks. Please wait before trying again." } });
export const verificationRateLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many verification requests. Please try again later." } });
export const passwordResetRateLimit = rateLimit({ windowMs: 30 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many password reset requests. Please try again later." } });
