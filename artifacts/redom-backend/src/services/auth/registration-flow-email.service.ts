import { and, eq, gt } from "drizzle-orm";

import { db } from "../../database/db";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";
import { validateRegistrationEmail } from "../../config/registration-email-domains";

export class RegistrationFlowEmailService {
  async save(params: {
    reservationId: string;
    flowId: string;
    deviceId?: string;
    email: string;
  }) {
    const reservation = await db.query.registrationFlowReservations.findFirst({
      where: and(
        eq(registrationFlowReservations.id, params.reservationId),
        eq(registrationFlowReservations.flowId, params.flowId),
        gt(registrationFlowReservations.expiresAt, new Date()),
      ),
    });

    if (!reservation) {
      throw new Error("Registration Flow ID is invalid or expired.");
    }
    if (reservation.deviceId && reservation.deviceId !== params.deviceId) {
      throw new Error("Registration Flow ID is not valid for this device.");
    }
    if (reservation.status !== "active") {
      throw new Error("This Registration Flow ID is no longer active.");
    }

    const validated = validateRegistrationEmail(params.email);
    const createdAt = new Date();

    const existingMemory = (reservation.memory ?? {}) as Record<string, unknown>;
    const existingScreens = (existingMemory.screens ?? {}) as Record<string, unknown>;
    const existingRegisteredTables = reservation.registeredTables ?? [];
    const emailMemory = {
      address: validated.email,
      domain: validated.domain,
      provider: validated.provider,
      verificationStatus: "not_started",
      savedAt: createdAt.toISOString(),
    };
    const memory = {
      ...existingMemory,
      email: emailMemory,
      screens: {
        ...existingScreens,
        email: {
          completed: true,
          completedAt: createdAt.toISOString(),
        },
      },
    };
    const registeredTables = [
      ...new Set([...existingRegisteredTables, "registration_flow_reservations"]),
    ];

    const [updated] = await db
      .update(registrationFlowReservations)
      .set({
        registeredTables,
        memory: memory as never,
      })
      .where(
        and(
          eq(registrationFlowReservations.id, reservation.id),
          eq(registrationFlowReservations.flowId, params.flowId),
        ),
      )
      .returning();

    if (!updated) {
      throw new Error("Unable to save the email address to the Registration Flow ID.");
    }

    return {
      success: true,
      flowId: updated.flowId,
      reservationId: updated.id,
      email: validated.email,
      provider: validated.provider,
      saved: true,
    };
  }
}

export const registrationFlowEmailService = new RegistrationFlowEmailService();
