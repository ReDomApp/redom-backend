import { and, eq } from "drizzle-orm";

import { db } from "../../database/db";
import {
  registrationFlowReservations,
  type RegistrationFlowMemory,
} from "../../database/registration-flow-reservations.schema";
import { logger } from "../../lib/logger";

const SCREEN_TABLES = ["registration_flow_reservations"] as const;

type Screen = "name" | "birthday" | "gender" | "phone";

type MemoryScreen = {
  completed: boolean;
  completedAt: string;
};

function mergeUnique(values: string[]) {
  return [...new Set(values)];
}

function buildMemory(
  reservation: typeof registrationFlowReservations.$inferSelect,
  screens: Record<string, MemoryScreen>,
): RegistrationFlowMemory {
  const existingNetworkSecurity = (reservation.memory?.networkSecurity ?? {}) as Record<string, unknown>;

  return {
    flow: {
      flowId: reservation.flowId,
      reservationId: reservation.id,
      status: reservation.status,
      expiresAt: reservation.expiresAt.toISOString(),
    },
    screens,
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
      ...existingNetworkSecurity,
      ipFraudScore: reservation.ipFraudScore,
      proxy: reservation.ipProxy,
      vpn: reservation.ipVpn,
      tor: reservation.ipTor,
      botStatus: reservation.ipBotStatus,
      countryCode: reservation.ipCountryCode,
    },
  };
}

export class RegistrationFlowMemoryService {
  async registerScreen(params: {
    reservationId: string;
    flowId: string;
    screen: Screen;
  }) {
    const reservation = await db.query.registrationFlowReservations.findFirst({
      where: and(
        eq(registrationFlowReservations.id, params.reservationId),
        eq(registrationFlowReservations.flowId, params.flowId),
      ),
    });

    if (!reservation) {
      throw new Error("Registration Flow ID memory could not be updated because the flow reservation was not found.");
    }

    const existingMemory = (reservation.memory ?? {}) as Partial<RegistrationFlowMemory>;
    const previousScreens = existingMemory.screens ?? {};
    const screens: Record<string, MemoryScreen> = {
      ...previousScreens,
      [params.screen]: {
        completed: true,
        completedAt: new Date().toISOString(),
      },
    };

    const registeredTables = mergeUnique([
      ...(reservation.registeredTables ?? []),
      ...SCREEN_TABLES,
    ]);
    const memory = buildMemory(reservation, screens);

    const [updated] = await db
      .update(registrationFlowReservations)
      .set({ registeredTables, memory })
      .where(
        and(
          eq(registrationFlowReservations.id, reservation.id),
          eq(registrationFlowReservations.flowId, params.flowId),
        ),
      )
      .returning();

    if (!updated) {
      throw new Error("Unable to update Registration Flow ID memory.");
    }

    return {
      flowId: updated.flowId,
      reservationId: updated.id,
      registeredTables: updated.registeredTables,
      memory: updated.memory,
    };
  }

  async get(params: { reservationId: string; flowId: string; deviceId?: string }) {
    const reservation = await db.query.registrationFlowReservations.findFirst({
      where: and(
        eq(registrationFlowReservations.id, params.reservationId),
        eq(registrationFlowReservations.flowId, params.flowId),
      ),
    });

    if (!reservation) {
      throw new Error("Registration Flow ID is invalid.");
    }
    if (reservation.deviceId && reservation.deviceId !== params.deviceId) {
      throw new Error("Registration Flow ID is not valid for this device.");
    }

    return {
      success: true,
      flowId: reservation.flowId,
      reservationId: reservation.id,
      status: reservation.status,
      expiresAt: reservation.expiresAt.toISOString(),
      registeredTables: reservation.registeredTables,
      memory: reservation.memory,
    };
  }

  async registerScreenSafely(params: {
    reservationId: string;
    flowId: string;
    screen: Screen;
  }) {
    try {
      return await this.registerScreen(params);
    } catch (error) {
      logger.error(
        { error, flowId: params.flowId, reservationId: params.reservationId, screen: params.screen },
        "Registration Flow ID memory update failed",
      );
      throw error;
    }
  }
}

export const registrationFlowMemoryService = new RegistrationFlowMemoryService();
