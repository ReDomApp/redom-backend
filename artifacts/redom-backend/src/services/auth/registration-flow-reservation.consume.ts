import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "../../database/db";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";
import { registrationFlowReservationService } from "./registration-flow-reservation.service";

type ConsumedReservation = {
  id: string;
  flowId: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  expiresAt: Date;
};

async function consumeRegistrationFlow(params: { reservationId: string; flowId: string; deviceId?: string }): Promise<ConsumedReservation> {
  // Keep this signature aligned with RegistrationChallengeService.start(), which passes
  // a single object. The old positional signature caused SQL to receive "[object Object]"
  // as reservationId and an empty flowId, crashing the final signup step.
  if (typeof params.reservationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.reservationId)
    || typeof params.flowId !== "string" || !/^\d{6,16}$/.test(params.flowId)) {
    throw new Error("Registration Flow ID reservation is incomplete. Please restart registration.");
  }
  await db.delete(registrationFlowReservations).where(lte(registrationFlowReservations.expiresAt, new Date()));
  const reservation = await db.query.registrationFlowReservations.findFirst({
    where: and(
      eq(registrationFlowReservations.id, params.reservationId),
      eq(registrationFlowReservations.flowId, params.flowId),
      eq(registrationFlowReservations.status, "active"),
      gt(registrationFlowReservations.expiresAt, new Date()),
    ),
  });
  if (!reservation) throw new Error("Registration Flow ID is invalid or expired.");
  if (reservation.deviceId && reservation.deviceId !== params.deviceId) throw new Error("Registration Flow ID is not valid for this device.");
  return { id: reservation.id, flowId: reservation.flowId, firstName: reservation.firstName, lastName: reservation.lastName, dateOfBirth: reservation.dateOfBirth, expiresAt: reservation.expiresAt };
}

Object.assign(registrationFlowReservationService as object, { consume: consumeRegistrationFlow });
