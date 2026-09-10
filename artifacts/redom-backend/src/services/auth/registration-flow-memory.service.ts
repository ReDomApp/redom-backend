import { eq } from "drizzle-orm";

import { db } from "../../database/db";
import { registrationFlowMemory } from "../../database/registration-flow-memory.schema";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";
import { logger } from "../../lib/logger";

const SCREEN_TABLES = {
  name: ["registration_flow_reservations"],
  birthday: ["registration_flow_reservations"],
  gender: ["registration_flow_reservations"],
  phone: ["registration_flow_reservations", "registration_flow_memory"],
} as const;

type Screen = keyof typeof SCREEN_TABLES;

function mergeUnique(values: string[]) {
  return [...new Set(values)];
}

function completionState(screen: Screen) {
  switch (screen) {
    case "name": return "name_completed";
    case "birthday": return "birthday_completed";
    case "gender": return "gender_completed";
    case "phone": return "phone_verified";
  }
}

export class RegistrationFlowMemoryService {
  async registerScreen(params: { reservationId: string; flowId: string; screen: Screen }) {
    const reservation = await db.query.registrationFlowReservations.findFirst({
      where: eq(registrationFlowReservations.id, params.reservationId),
    });
    if (!reservation || reservation.flowId !== params.flowId) {
      throw new Error("Registration Flow ID memory could not be updated because the flow reservation was not found.");
    }

    const existing = await db.query.registrationFlowMemory.findFirst({
      where: eq(registrationFlowMemory.flowId, params.flowId),
    });
    const now = new Date();
    const tables = mergeUnique([...(existing?.registeredTables ?? []), ...SCREEN_TABLES[params.screen]]);
    const previousScreens = (existing?.memory?.screens as Record<string, unknown> | undefined) ?? {};
    const previousMemory = existing?.memory ?? {};

    const memory: Record<string, unknown> = {
      ...previousMemory,
      flow: {
        flowId: reservation.flowId,
        reservationId: reservation.id,
        status: reservation.status,
        expiresAt: reservation.expiresAt.toISOString(),
      },
      screens: {
        ...previousScreens,
        [params.screen]: { completed: true, completedAt: now.toISOString() },
      },
      identity: { firstName: reservation.firstName, lastName: reservation.lastName },
      birthday: { dateOfBirth: reservation.dateOfBirth },
      gender: { gender: reservation.gender, pronouns: reservation.pronouns },
      phoneLookup: {
        phoneNumber: reservation.phoneNumber,
        lookupStatus: reservation.phoneLookupStatus,
        valid: reservation.phoneValid,
        active: reservation.phoneActive,
        voip: reservation.phoneVoip,
        fraudScore: reservation.phoneFraudScore,
        lineType: reservation.phoneLineType,
        carrier: reservation.phoneCarrier,
        lookupRequestId: reservation.phoneLookupRequestId,
      },
      networkSecurity: {
        ipFraudScore: reservation.ipFraudScore,
        proxy: reservation.ipProxy,
        vpn: reservation.ipVpn,
        tor: reservation.ipTor,
        botStatus: reservation.ipBotStatus,
        countryCode: reservation.ipCountryCode,
      },
    };

    if (existing) {
      const [updated] = await db.update(registrationFlowMemory)
        .set({ completionState: completionState(params.screen), registeredTables: tables, memory, updatedAt: now })
        .where(eq(registrationFlowMemory.flowId, params.flowId))
        .returning();
      if (!updated) throw new Error("Unable to update registration Flow ID memory.");
      return updated;
    }

    const [created] = await db.insert(registrationFlowMemory).values({
      flowId: reservation.flowId,
      reservationId: reservation.id,
      completionState: completionState(params.screen),
      registeredTables: tables,
      memory,
      registeredAt: now,
      updatedAt: now,
    }).returning();
    if (!created) throw new Error("Unable to create registration Flow ID memory.");
    return created;
  }

  async registerScreenSafely(params: { reservationId: string; flowId: string; screen: Screen }) {
    try {
      return await this.registerScreen(params);
    } catch (error) {
      logger.error({ error, flowId: params.flowId, screen: params.screen }, "Registration Flow ID memory update failed");
      throw error;
    }
  }
}

export const registrationFlowMemoryService = new RegistrationFlowMemoryService();
