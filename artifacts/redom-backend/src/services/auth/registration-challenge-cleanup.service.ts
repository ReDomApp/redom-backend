import { logger } from "../../lib/logger";
import { registrationChallengeService } from "./registration-challenge.service";

const CLEANUP_INTERVAL_MS = 30_000;

let cleanupTimer: NodeJS.Timeout | undefined;
let cleanupRunning = false;

async function cleanupExpiredRegistrationChallenges() {
  if (cleanupRunning) return;
  cleanupRunning = true;

  try {
    await registrationChallengeService.purgeExpired();
  } catch (error) {
    logger.error({ error }, "Failed to purge expired registration challenges");
  } finally {
    cleanupRunning = false;
  }
}

export function startRegistrationChallengeCleanup() {
  if (cleanupTimer) return;

  void cleanupExpiredRegistrationChallenges();
  cleanupTimer = setInterval(() => {
    void cleanupExpiredRegistrationChallenges();
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}

export function stopRegistrationChallengeCleanup() {
  if (!cleanupTimer) return;
  clearInterval(cleanupTimer);
  cleanupTimer = undefined;
}
