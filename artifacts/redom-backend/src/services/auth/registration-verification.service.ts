import { randomBytes, randomInt } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../../database/db";
import { registrationChallenges } from "../../database/registration-challenges.schema";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";
import { users } from "../../database/schema";
import { verifications } from "../../database/verifications.schema";
import { emailService } from "./email.service";
import { verificationService } from "./verification.service";
import { checkPhone, isPhoneProviderFailure } from "../../lib/ipqs";

type ContactType = "phone" | "email";
const MIN_FLOW_LENGTH = 6;
const MAX_FLOW_LENGTH = 16;
const FLOW_ATTEMPTS = 12;

function generateFlowId() {
  const length = randomInt(MIN_FLOW_LENGTH, MAX_FLOW_LENGTH + 1);
  const bytes = randomBytes(length);
  let value = "";
  for (let i = 0; i < length; i += 1) {
    let byte = bytes[i]!;
    while (byte >= 250) byte = randomBytes(1)[0]!;
    value += String(byte % 10);
  }
  return value;
}
function maskFlowId(value: string) { return value.length > 4 ? `${value.slice(0, 4)}••••••••✓` : `${value}✓`; }
function maskTarget(target: string, type: ContactType) {
  if (type === "phone") { const digits = target.replace(/\s/g, ""); return digits.length > 8 ? `${digits.slice(0, 5)}•••••••••${digits.slice(-1)}` : `${digits.slice(0, 2)}••••`; }
  const [local, domain] = target.split("@");
  if (!local || !domain) return "••••";
  return `${local.slice(0, 3)}••••••••${local.slice(-1)}@${domain}`;
}

async function activeReservation(reservationId: string, flowId: string, deviceId?: string) {
  const reservation = await db.query.registrationFlowReservations.findFirst({ where: and(eq(registrationFlowReservations.id, reservationId), eq(registrationFlowReservations.flowId, flowId), eq(registrationFlowReservations.status, "active"), gt(registrationFlowReservations.expiresAt, new Date())) });
  if (!reservation) throw new Error("Registration Flow ID is invalid or expired.");
  if (reservation.deviceId && reservation.deviceId !== deviceId) throw new Error("Registration Flow ID is not valid for this device.");
  return reservation;
}

async function nextFlowId() {
  for (let attempt = 0; attempt < FLOW_ATTEMPTS; attempt += 1) {
    const candidate = generateFlowId();
    const [reservation, challenge] = await Promise.all([
      db.query.registrationFlowReservations.findFirst({ where: eq(registrationFlowReservations.flowId, candidate) }),
      db.query.registrationChallenges.findFirst({ where: and(eq(registrationChallenges.flowId, candidate), gt(registrationChallenges.expiresAt, new Date())) }),
    ]);
    if (!reservation && !challenge) return candidate;
  }
  throw new Error("Unable to refresh the registration Flow ID.");
}

async function rotateFlow(reservationId: string, oldFlowId: string, deviceId?: string) {
  const reservation = await activeReservation(reservationId, oldFlowId, deviceId);
  const flowId = await nextFlowId();
  const memory = { ...((reservation.memory ?? {}) as Record<string, unknown>) } as Record<string, any>;
  memory.flow = { ...((memory.flow ?? {}) as Record<string, unknown>), flowId, reservationId: reservation.id, status: reservation.status, expiresAt: reservation.expiresAt.toISOString() };
  const [updated] = await db.update(registrationFlowReservations).set({ flowId, memory }).where(and(eq(registrationFlowReservations.id, reservation.id), eq(registrationFlowReservations.flowId, oldFlowId), gt(registrationFlowReservations.expiresAt, new Date()))).returning();
  if (!updated) throw new Error("Registration Flow ID expired while it was being refreshed.");
  return updated;
}

export class RegistrationVerificationService {
  async resend(params: { verificationChallengeId: string; reservationId: string; flowId: string; deviceId?: string }) {
    await activeReservation(params.reservationId, params.flowId, params.deviceId);
    const result = await verificationService.resendVerification({ challengeId: params.verificationChallengeId, deviceId: params.deviceId });
    const reservation = await rotateFlow(params.reservationId, params.flowId, params.deviceId);
    const contactType: ContactType = result.channel === "sms" ? "phone" : "email";
    return { success: true, verificationChallengeId: result.challengeId, flowId: maskFlowId(reservation.flowId), rawFlowId: reservation.flowId, channel: result.channel, maskedTarget: maskTarget(result.target, contactType), expiresAt: result.expiresAt.toISOString() };
  }

  async switchContact(params: { verificationChallengeId: string; reservationId: string; flowId: string; deviceId?: string; contactType: ContactType; target: string }) {
    const reservation = await activeReservation(params.reservationId, params.flowId, params.deviceId);
    const verification = await db.query.verifications.findFirst({ where: eq(verifications.id, params.verificationChallengeId) });
    if (!verification || !verification.userId) throw new Error("Verification challenge not found.");
    if (!["EMAIL_VERIFICATION", "PHONE_VERIFICATION"].includes(verification.purpose)) throw new Error("Verification challenge is invalid for registration.");
    const user = await db.query.users.findFirst({ where: eq(users.id, verification.userId) });
    if (!user) throw new Error("Registration account not found.");

    let normalizedTarget: string;
    let channel: "sms" | "email";
    if (params.contactType === "email") {
      normalizedTarget = emailService.validate(params.target);
      const existing = await db.query.users.findFirst({ where: eq(users.email, normalizedTarget) });
      if (existing && existing.id !== user.id) throw new Error("That email address is already registered.");
      await db.update(users).set({ email: normalizedTarget, emailVerified: false, updatedAt: new Date() }).where(eq(users.id, user.id));
      const memory = { ...((reservation.memory ?? {}) as Record<string, any>) };
      memory.email = { ...(memory.email ?? {}), address: normalizedTarget, domain: normalizedTarget.split("@")[1], verificationStatus: "pending", savedAt: new Date().toISOString() };
      await db.update(registrationFlowReservations).set({ memory }).where(eq(registrationFlowReservations.id, reservation.id));
      channel = "email";
    } else {
      let lookup;
      try { lookup = await checkPhone(params.target); }
      catch (error) { if (isPhoneProviderFailure(error)) throw new Error("We could not verify this phone number right now. Please try again."); throw error; }
      if (lookup.valid === false) throw new Error(lookup.message || "This phone number is invalid or does not exist.");
      if (lookup.VOIP === true) throw new Error("This phone number cannot be used because it appears to be a VoIP number.");
      normalizedTarget = lookup.formatted || params.target;
      const existing = await db.query.users.findFirst({ where: eq(users.phoneNumber, normalizedTarget) });
      if (existing && existing.id !== user.id) throw new Error("That phone number is already registered.");
      await db.update(users).set({ phoneNumber: normalizedTarget, phoneVerified: false, updatedAt: new Date() }).where(eq(users.id, user.id));
      const memory = { ...((reservation.memory ?? {}) as Record<string, any>) };
      memory.phoneLookup = { ...(memory.phoneLookup ?? {}), phoneNumber: normalizedTarget, lookupStatus: "verified", valid: lookup.valid ?? true, active: lookup.active ?? null, voip: lookup.VOIP ?? null, fraudScore: Number(lookup.fraud_score ?? 0), lineType: lookup.line_type ?? null, carrier: lookup.carrier ?? null, lookupRequestId: lookup.request_id ?? null };
      await db.update(registrationFlowReservations).set({ phoneNumber: normalizedTarget, phoneCountryCode: lookup.country_code?.toUpperCase() ?? reservation.phoneCountryCode, phoneLookupStatus: "verified", phoneValid: lookup.valid ?? true, phoneActive: lookup.active ?? null, phoneVoip: lookup.VOIP ?? null, phoneFraudScore: Number(lookup.fraud_score ?? 0), phoneLineType: lookup.line_type ?? null, phoneCarrier: lookup.carrier ?? null, memory }).where(eq(registrationFlowReservations.id, reservation.id));
      channel = "sms";
    }

    const purpose = channel === "sms" ? "PHONE_VERIFICATION" : "EMAIL_VERIFICATION";
    const created = await verificationService.createVerification({ userId: user.id, purpose, target: normalizedTarget, channel, requestedLength: 6, firstName: user.firstName ?? undefined, deviceId: params.deviceId });
    const refreshed = await rotateFlow(params.reservationId, params.flowId, params.deviceId);
    return { success: true, verificationChallengeId: created.challengeId, flowId: maskFlowId(refreshed.flowId), rawFlowId: refreshed.flowId, channel, maskedTarget: maskTarget(normalizedTarget, params.contactType), expiresAt: created.expiresAt.toISOString() };
  }
}

export const registrationVerificationService = new RegistrationVerificationService();
