import { randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, lte } from "drizzle-orm";

import { db } from "../../database/db";
import { registrationChallenges } from "../../database/registration-challenges.schema";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";
import { logger } from "../../lib/logger";

const TTL_MS = 30 * 60 * 1000;
const MIN_LENGTH = 6;
const MAX_LENGTH = 16;
const MAX_NAME_LENGTH = 100;
const NAME_PATTERN = /^[\p{L}][\p{L}\s.'-]*$/u;

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

function validateName(value: string, field: "First name" | "Last name") {
  const normalized = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (normalized.length < 3) throw new Error(`${field} must be at least 3 characters.`);
  if (normalized.length > MAX_NAME_LENGTH) throw new Error(`${field} is too long.`);
  if (!NAME_PATTERN.test(normalized)) {
    throw new Error(`${field} can contain letters, spaces, periods, commas, apostrophes, and hyphens only.`);
  }
  if (!/\p{L}/u.test(normalized)) throw new Error(`${field} must contain letters.`);
  return normalized;
}

export class RegistrationFlowReservationService {
  private async purgeExpired() {
    try {
      await db.delete(registrationFlowReservations).where(
        lte(registrationFlowReservations.expiresAt, new Date()),
      );
    } catch (error) {
      // Expired-row cleanup is maintenance, not a prerequisite for allocating
      // a new Flow ID. Never turn a cleanup failure into a broken signup screen.
      logger.warn({ error }, "Unable to purge expired registration Flow reservations; continuing");
    }
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

  async saveName(params: {
    reservationId: string;
    flowId: string;
    deviceId?: string;
    firstName: string;
    lastName: string;
  }) {
    await this.purgeExpired();
    const reservation = await db.query.registrationFlowReservations.findFirst({
      where: and(
        eq(registrationFlowReservations.id, params.reservationId),
        eq(registrationFlowReservations.flowId, params.flowId),
        gt(registrationFlowReservations.expiresAt, new Date()),
      ),
    });
    if (!reservation) throw new Error("Registration Flow ID is invalid or expired.");
    if (reservation.deviceId && reservation.deviceId !== params.deviceId) {
      throw new Error("Registration Flow ID is not valid for this device.");
    }

    const firstName = validateName(params.firstName, "First name");
    const lastName = validateName(params.lastName, "Last name");

    const [updated] = await db.update(registrationFlowReservations)
      .set({ firstName, lastName })
      .where(and(
        eq(registrationFlowReservations.id, reservation.id),
        eq(registrationFlowReservations.flowId, params.flowId),
        gt(registrationFlowReservations.expiresAt, new Date()),
      ))
      .returning();
    if (!updated) throw new Error("Unable to save your name to this registration flow.");

    return {
      success: true,
      reservationId: updated.id,
      flowId: updated.flowId,
      expiresAt: updated.expiresAt.toISOString(),
    };
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
    return reservation;
  }
}

export const registrationFlowReservationService = new RegistrationFlowReservationService();