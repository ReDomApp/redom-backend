import { and, eq, gt } from "drizzle-orm";
import { db } from "../../database/db";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";
import { hashPassword } from "../../utils/password";

export class RegistrationFlowPasswordService {
  async save(params: { reservationId: string; flowId: string; deviceId?: string; password: string; strength: "weak" | "medium" | "strong"; rememberLoginInfo: boolean }) {
    const reservation = await db.query.registrationFlowReservations.findFirst({ where: and(eq(registrationFlowReservations.id, params.reservationId), eq(registrationFlowReservations.flowId, params.flowId), gt(registrationFlowReservations.expiresAt, new Date())) });
    if (!reservation) throw new Error("Registration Flow ID is invalid or expired.");
    if (reservation.deviceId && reservation.deviceId !== params.deviceId) throw new Error("Registration Flow ID is not valid for this device.");
    if (reservation.status !== "active") throw new Error("This Registration Flow ID is no longer active.");
    if (params.password.length < 6) throw new Error("Password must contain at least 6 letters or numbers.");

    const passwordHash = await hashPassword(params.password);
    const createdAt = new Date();
    const existingMemory = (reservation.memory ?? {}) as Record<string, unknown>;
    const existingScreens = (existingMemory.screens ?? {}) as Record<string, unknown>;
    const memory = {
      ...existingMemory,
      password: { hash: passwordHash, strength: params.strength, rememberLoginInfo: params.rememberLoginInfo, savedAt: createdAt.toISOString() },
      screens: { ...existingScreens, password: { completed: true, completedAt: createdAt.toISOString() } },
    };
    const registeredTables = [...new Set([...(reservation.registeredTables ?? []), "registration_flow_reservations"])];
    const [updated] = await db.update(registrationFlowReservations).set({ registeredTables, memory: memory as never }).where(and(eq(registrationFlowReservations.id, reservation.id), eq(registrationFlowReservations.flowId, params.flowId))).returning();
    if (!updated) throw new Error("Unable to save password details to the Registration Flow ID.");
    return { success: true, reservationId: updated.id, flowId: updated.flowId, expiresAt: updated.expiresAt.toISOString(), strength: params.strength, rememberLoginInfo: params.rememberLoginInfo };
  }
}
export const registrationFlowPasswordService = new RegistrationFlowPasswordService();
