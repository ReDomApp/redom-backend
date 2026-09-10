import { and, eq } from "drizzle-orm";

import { db } from "../../database/db";
import { registrationFlowMemory } from "../../database/registration-flow-memory.schema";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";

const REGISTERED_TABLES = [
  "registration_flow_reservations",
  "registration_flow_memory",
  "registration_challenges",
  "users",
  "userProfiles",
  "accountSecurity",
  "verification",
] as const;

export async function registerRegistrationFlowMemory(params: {
  reservationId: string;
  flowId: string;
}) {
  const reservation = await db.query.registrationFlowReservations.findFirst({
    where: and(
      eq(registrationFlowReservations.id, params.reservationId),
      eq(registrationFlowReservations.flowId, params.flowId),
    ),
  });

  if (!reservation) throw new Error("Registration Flow ID is invalid or expired.");
  if (!reservation.firstName || !reservation.lastName || !reservation.dateOfBirth || !reservation.gender || !reservation.phoneNumber) {
    throw new Error("Registration Flow data is incomplete and cannot be registered in Flow memory.");
  }
  if (reservation.phoneLookupStatus !== "verified") {
    throw new Error("The phone verification must succeed before Flow memory is registered.");
  }

  const memory = {
    identity: {
      firstName: reservation.firstName,
      lastName: reservation.lastName,
    },
    birthday: {
      dateOfBirth: reservation.dateOfBirth,
    },
    gender: {
      gender: reservation.gender,
      pronouns: reservation.pronouns,
    },
    contact: {
      phoneNumber: reservation.phoneNumber,
      phoneCountryCode: reservation.phoneCountryCode,
    },
    phoneLookup: {
      status: reservation.phoneLookupStatus,
      valid: reservation.phoneValid,
      active: reservation.phoneActive,
      voip: reservation.phoneVoip,
      fraudScore: reservation.phoneFraudScore,
      lineType: reservation.phoneLineType,
      carrier: reservation.phoneCarrier,
      countryCode: reservation.phoneLookupCountryCode,
      requestId: reservation.phoneLookupRequestId,
      checkedAt: reservation.phoneLookupAt?.toISOString() ?? null,
    },
    networkSecurity: {
      fraudScore: reservation.ipFraudScore,
      proxy: reservation.ipProxy,
      vpn: reservation.ipVpn,
      tor: reservation.ipTor,
      botStatus: reservation.ipBotStatus,
      countryCode: reservation.ipCountryCode,
    },
  } satisfies Record<string, unknown>;

  const now = new Date();
  const [stored] = await db
    .insert(registrationFlowMemory)
    .values({
      flowId: reservation.flowId,
      reservationId: reservation.id,
      completionState: "phone_verified",
      registeredTables: [...REGISTERED_TABLES],
      memory,
      registeredAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: registrationFlowMemory.flowId,
      set: {
        reservationId: reservation.id,
        completionState: "phone_verified",
        registeredTables: [...REGISTERED_TABLES],
        memory,
        updatedAt: now,
      },
    })
    .returning();

  if (!stored) throw new Error("Unable to register the completed registration Flow in Flow memory.");

  return {
    success: true,
    flowId: stored.flowId,
    reservationId: stored.reservationId,
    completionState: stored.completionState,
    registeredTables: stored.registeredTables,
    registeredAt: stored.registeredAt.toISOString(),
  };
}
