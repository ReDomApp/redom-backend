import { lte } from "drizzle-orm";

import { db } from "../../database/db";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";
import { logger } from "../../lib/logger";

// A registration Flow ID is ephemeral. Its reservation and every memory field
// stored inside it must disappear as soon as its 30-minute lifetime ends.
const CLEANUP_INTERVAL_MS = 30_000;

let cleanupTimer: NodeJS.Timeout | undefined;
let cleanupRunning = false;

export async function purgeExpiredRegistrationFlowReservations(): Promise<void> {
  await db
    .delete(registrationFlowReservations)
    .where(lte(registrationFlowReservations.expiresAt, new Date()));
}

async function cleanupExpiredRegistrationFlows(): Promise<void> {
  if (cleanupRunning) return;
  cleanupRunning = true;

  try {
    await purgeExpiredRegistrationFlowReservations();
  } catch (error) {
    logger.error(
      { error },
      "Failed to permanently purge expired registration Flow ID memory",
    );
  } finally {
    cleanupRunning = false;
  }
}

export function startRegistrationFlowReservationCleanup(): void {
  if (cleanupTimer) return;

  // Purge anything that expired while the process was offline before accepting
  // new registration work.
  void cleanupExpiredRegistrationFlows();

  cleanupTimer = setInterval(() => {
    void cleanupExpiredRegistrationFlows();
  }, CLEANUP_INTERVAL_MS);

  cleanupTimer.unref();
}

export function stopRegistrationFlowReservationCleanup(): void {
  if (!cleanupTimer) return;
  clearInterval(cleanupTimer);
  cleanupTimer = undefined;
}
