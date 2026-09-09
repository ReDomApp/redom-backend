import { registrationChallengeService } from "./registration-challenge.service";
import { logger } from "../../lib/logger";

const CLEANUP_INTERVAL_MS = 1000;

let cleanupTimer: NodeJS.Timeout | undefined;

async function cleanupExpiredRegistrationChallenges() {
  try {
    await registrationChallengeService.purgeExpired();
  } catch (error) {
    logger.error({ error }, "Failed to purge expired registration challenges");
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
