import { and, eq, gt } from "drizzle-orm";
import { db } from "../../database/db";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";
import { hashPassword } from "../../utils/password";

function passwordIsStrongEnough(password: string) {
  const hasLetter = /\p{L}/u.test(password);
  const hasNumber = /\p{N}/u.test(password);
  const lengthScore = Math.min(50, Math.max(0, Math.round((password.length - 6) * 8.34)));
  const percent = Math.min(100, lengthScore + (hasLetter ? 25 : 0) + (hasNumber ? 25 : 0));
  return hasLetter && hasNumber && percent === 100;
}

export class RegistrationFlowPasswordService {
  async save(params: { reservationId: string; flowId: string; deviceId?: string; password: string; strength: "weak" | "medium" | "strong"; rememberLoginInfo: boolean }) {
    const reservation = await db.query.registrationFlowReservations.findFirst({ where: and(eq(registrationFlowReservations.id, params.reservationId), eq(registrationFlowReservations.flowId, params.flowId), gt(registrationFlowReservations.expiresAt, new Date())) });
    if (!reservation) throw new Error("Registration Flow ID is invalid or expired.");
    if (reservation.deviceId && reservation.deviceId !== params.deviceId) throw new Error("Registration Flow ID is not valid for this device.");
    if (reservation.status !== "active") throw new Error("This Registration Flow ID is no longer active.");
    if (params.password.length < 6) throw new Error("Password must contain at least 6 characters.");
    if (!/\p{L}/u.test(params.password) || !/\p{N}/u.test(params.password)) throw new Error("Password must contain at least one letter and one number. Numbers-only and letters-only passwords are not accepted.");
    if (!passwordIsStrongEnough(params.password) || params.strength !== "strong") throw new Error("Password strength must reach 100% Strong before continuing.");

    const passwordHash = await hashPassword(params.password);
    const createdAt = new Date();
    const existingMemory = (reservation.memory ?? {}) as Record<string, unknown>;
    const existingScreens = (existingMemory.screens ?? {}) as Record<string, unknown>;
    const memory = {
      ...existingMemory,
      password: { hash: passwordHash, strength: "strong", rememberLoginInfo: params.rememberLoginInfo, savedAt: createdAt.toISOString() },
      screens: { ...existingScreens, password: { completed: true, completedAt: createdAt.toISOString() } },
    };
    const registeredTables = [...new Set([...(reservation.registeredTables ?? []), "registration_flow_reservations"])];
    const [updated] = await db.update(registrationFlowReservations).set({ registeredTables, memory: memory as never }).where(and(eq(registrationFlowReservations.id, reservation.id), eq(registrationFlowReservations.flowId, params.flowId))).returning();
    if (!updated) throw new Error("Unable to save password details to the Registration Flow ID.");
    return { success: true, reservationId: updated.id, flowId: updated.flowId, expiresAt: updated.expiresAt.toISOString(), strength: "strong" as const, rememberLoginInfo: params.rememberLoginInfo };
  }
}
export const registrationFlowPasswordService = new RegistrationFlowPasswordService();
