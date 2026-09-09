import { randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, lte } from "drizzle-orm";

import { db } from "../../database/db";
import { registrationChallenges } from "../../database/registration-challenges.schema";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";

const TTL_MS = 30 * 60 * 1000;
const MIN_LENGTH = 6;
const MAX_LENGTH = 16;

function generateNumericFlowId() {
  const length = randomInt(MIN_LENGTH, MAX_LENGTH + 1);
  const bytes = randomBytes(length);
  let value = "";
  for (let i = 0; i < length; i += 1) {
    let byte = bytes[i]!;
    while (byte >= 250) byte = randomBytes(1)[0]!;
    value += String(byte % 10);
  }
  return value;
}

export class RegistrationFlowReservationService {
  private async purgeExpired() {
    await db.delete(registrationFlowReservations).where(
      lte(registrationFlowReservations.expiresAt, new Date()),
    );
  }

  async reserve(deviceId?: string) {
    await this.purgeExpired();
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const flowId = generateNumericFlowId();
      const now = new Date();
      const existingReservation = await db.query.registrationFlowReservations.findFirst({
        where: eq(registrationFlowReservations.flowId, flowId),
      });
      if (existingReservation) continue;
      const existingChallenge = await db.query.registrationChallenges.findFirst({
        where: and(
          eq(registrationChallenges.flowId, flowId),
          gt(registrationChallenges.expiresAt, now),
        ),
      });
      if (existingChallenge) continue;

      const [reservation] = await db.insert(registrationFlowReservations).values({
        flowId,
        deviceId,
        expiresAt: new Date(now.getTime() + TTL_MS),
        createdAt: now,
      }).returning();
      if (!reservation) throw new Error("Unable to allocate a registration Flow ID.");
      return {
        success: true,
        reservationId: reservation.id,
        flowId: reservation.flowId,
        expiresAt: reservation.expiresAt.toISOString(),
      };
    }
    throw new Error("Unable to allocate a unique registration Flow ID.");
  }

  async consume(reservationId: string, flowId: string, deviceId?: string) {
    await this.purgeExpired();
    const reservation = await db.query.registrationFlowReservations.findFirst({
      where: and(
        eq(registrationFlowReservations.id, reservationId),
        eq(registrationFlowReservations.flowId, flowId),
        gt(registrationFlowReservations.expiresAt, new Date()),
      ),
    });
    if (!reservation) throw new Error("Registration Flow ID is invalid or expired.");
    if (reservation.deviceId && deviceId && reservation.deviceId !== deviceId) {
      throw new Error("Registration Flow ID is not valid for this device.");
    }
    await db.delete(registrationFlowReservations).where(eq(registrationFlowReservations.id, reservation.id));
    return reservation.flowId;
  }
}

export const registrationFlowReservationService = new RegistrationFlowReservationService();
