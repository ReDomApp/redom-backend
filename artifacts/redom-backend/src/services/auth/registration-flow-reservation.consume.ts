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

async function consumeRegistrationFlow(reservationId: string, flowId: string, deviceId?: string): Promise<ConsumedReservation> {
  await db.delete(registrationFlowReservations).where(lte(registrationFlowReservations.expiresAt, new Date()));
  const reservation = await db.query.registrationFlowReservations.findFirst({
    where: and(
      eq(registrationFlowReservations.id, reservationId),
      eq(registrationFlowReservations.flowId, flowId),
      eq(registrationFlowReservations.status, "active"),
      gt(registrationFlowReservations.expiresAt, new Date()),
    ),
  });
  if (!reservation) throw new Error("Registration Flow ID is invalid or expired.");
  if (reservation.deviceId && reservation.deviceId !== deviceId) throw new Error("Registration Flow ID is not valid for this device.");
  return { id: reservation.id, flowId: reservation.flowId, firstName: reservation.firstName, lastName: reservation.lastName, dateOfBirth: reservation.dateOfBirth, expiresAt: reservation.expiresAt };
}

Object.assign(registrationFlowReservationService as object, { consume: consumeRegistrationFlow });
