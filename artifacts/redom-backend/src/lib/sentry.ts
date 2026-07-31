import * as Sentry from "@sentry/node";

export function initializeSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn("SENTRY_DSN is not configured. Sentry is disabled.");
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 1.0,
  });
}

export { Sentry };