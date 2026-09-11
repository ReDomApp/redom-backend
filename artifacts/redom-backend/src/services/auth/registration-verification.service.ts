import { and, eq, gt } from "drizzle-orm";
import { db } from "../../database/db";
import { registrationChallenges } from "../../database/registration-challenges.schema";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";
import { users } from "../../database/schema";
import { verifications } from "../../database/verifications.schema";
import { emailService } from "./email.service";
import { verificationService } from "./verification.service";
import { checkPhone, isPhoneProviderFailure, type PhoneLookupResult } from "../../lib/ipqs";

type ContactType = "phone" | "email";
const SUPPORTED_EMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "yahoo.co.uk", "yahoo.ca", "yahoo.com.au", "ymail.com", "rocketmail.com"]);

function maskFlowId(value: string) { return value.length > 4 ? `${value.slice(0, 4)}••••••••✓` : `${value}✓`; }
function maskTarget(target: string, type: ContactType) {
  if (type === "phone") { const digits = target.replace(/\s/g, ""); return digits.length > 8 ? `${digits.slice(0, 5)}•••••••••${digits.slice(-1)}` : `${digits.slice(0, 2)}••••`; }
  const [local, domain] = target.split("@");
  if (!local || !domain) return "••••";
  return `${local.slice(0, 3)}••••••••${local.slice(-1)}@${domain}`;
}

async function activeReservation(reservationId: string | undefined, flowId: string, deviceId?: string) {
  const reservation = await db.query.registrationFlowReservations.findFirst({ where: and(reservationId ? eq(registrationFlowReservations.id, reservationId) : eq(registrationFlowReservations.flowId, flowId), eq(registrationFlowReservations.flowId, flowId), eq(registrationFlowReservations.status, "active"), gt(registrationFlowReservations.expiresAt, new Date())) });
  if (!reservation) throw new Error("Registration Flow ID is invalid or expired.");
  if (reservation.deviceId && reservation.deviceId !== deviceId) throw new Error("Registration Flow ID is not valid for this device.");
  return reservation;
}

async function saveVerificationToFlow(reservationId: string, flowId: string, verification: { challengeId: string; channel: "sms" | "email"; target: string; expiresAt: Date | string }) {
  const current = await db.query.registrationFlowReservations.findFirst({ where: and(eq(registrationFlowReservations.id, reservationId), eq(registrationFlowReservations.flowId, flowId), eq(registrationFlowReservations.status, "active"), gt(registrationFlowReservations.expiresAt, new Date())) });
  if (!current) throw new Error("Registration Flow ID is invalid or expired.");
  const memory = { ...((current.memory ?? {}) as Record<string, any>) };
  memory.flow = { ...(memory.flow ?? {}), flowId: current.flowId, reservationId: current.id, status: current.status, expiresAt: current.expiresAt.toISOString() };
  memory.verification = { challengeId: verification.challengeId, channel: verification.channel, target: verification.target, maskedTarget: maskTarget(verification.target, verification.channel === "sms" ? "phone" : "email"), expiresAt: verification.expiresAt instanceof Date ? verification.expiresAt.toISOString() : verification.expiresAt, status: "pending", updatedAt: new Date().toISOString() };
  const registeredTables = [...new Set([...(current.registeredTables ?? []), "registration_flow_reservations", "verifications"])] as string[];
  const [updated] = await db.update(registrationFlowReservations).set({ memory, registeredTables }).where(and(eq(registrationFlowReservations.id, current.id), eq(registrationFlowReservations.flowId, flowId), gt(registrationFlowReservations.expiresAt, new Date()))).returning();
  if (!updated) throw new Error("Unable to update verification details inside the Registration Flow ID.");
  return updated;
}

export class RegistrationVerificationService {
  async resend(params: { verificationChallengeId: string; reservationId?: string; flowId: string; deviceId?: string }) {
    const reservation = await activeReservation(params.reservationId, params.flowId, params.deviceId);
    const old = await db.query.verifications.findFirst({ where: eq(verifications.id, params.verificationChallengeId) });
    if (!old) throw new Error("Verification challenge not found.");
    const registrationChallenge = old.sessionId ? await db.query.registrationChallenges.findFirst({ where: eq(registrationChallenges.id, old.sessionId) }) : null;
    const result = await verificationService.resendVerification({
      challengeId: params.verificationChallengeId,
      deviceId: params.deviceId,
      firstName: registrationChallenge?.firstName ?? undefined,
      requestIp: registrationChallenge?.requestIp ?? undefined,
      userAgent: registrationChallenge?.userAgent ?? undefined,
      sessionId: old.sessionId ?? undefined,
    });
    const updated = await saveVerificationToFlow(reservation.id, reservation.flowId, result);
    const contactType: ContactType = result.channel === "sms" ? "phone" : "email";
    return { success: true, verificationChallengeId: result.challengeId, flowId: maskFlowId(updated.flowId), rawFlowId: updated.flowId, channel: result.channel, maskedTarget: maskTarget(result.target, contactType), expiresAt: result.expiresAt.toISOString() };
  }

  async switchContact(params: { verificationChallengeId: string; reservationId?: string; flowId: string; deviceId?: string; contactType: ContactType; target: string }) {
    const reservation = await activeReservation(params.reservationId, params.flowId, params.deviceId);
    const verification = await db.query.verifications.findFirst({ where: eq(verifications.id, params.verificationChallengeId) });
    if (!verification) throw new Error("Verification challenge not found.");
    if (!["EMAIL_VERIFICATION", "PHONE_VERIFICATION"].includes(verification.purpose)) throw new Error("Verification challenge is invalid for registration.");

    const registrationChallenge = verification.sessionId ? await db.query.registrationChallenges.findFirst({ where: eq(registrationChallenges.id, verification.sessionId) }) : null;
    const user = verification.userId ? await db.query.users.findFirst({ where: eq(users.id, verification.userId) }) : null;
    if (!registrationChallenge && !user) throw new Error("Registration verification state could not be found.");

    let normalizedTarget: string;
    let channel: "sms" | "email";

    if (params.contactType === "email") {
      normalizedTarget = emailService.validate(params.target);
      const domain = normalizedTarget.split("@")[1]?.toLowerCase();
      if (!domain || !SUPPORTED_EMAIL_DOMAINS.has(domain)) throw new Error("Please use a supported Google, Microsoft, or Yahoo email address.");
      const existing = await db.query.users.findFirst({ where: eq(users.email, normalizedTarget) });
      if (existing && existing.id !== user?.id && !(existing.accountStatus === "pending" && !existing.emailVerified && !existing.phoneVerified)) throw new Error("That email address is already registered.");
      if (registrationChallenge) {
        await db.update(registrationChallenges).set({ contactType: "email", target: normalizedTarget, normalizedTarget, email: normalizedTarget, updatedAt: new Date() }).where(eq(registrationChallenges.id, registrationChallenge.id));
        const memory = { ...((reservation.memory ?? {}) as Record<string, any>) };
        memory.email = { ...(memory.email ?? {}), address: normalizedTarget, domain, provider: domain.includes("google") ? "google" : domain.includes("yahoo") ? "yahoo" : "microsoft", verificationStatus: "pending", savedAt: new Date().toISOString() };
        await db.update(registrationFlowReservations).set({ memory, registeredTables: [...new Set([...(reservation.registeredTables ?? []), "registration_flow_reservations", "email"])] as string[] }).where(eq(registrationFlowReservations.id, reservation.id));
      } else if (user) {
        await db.update(users).set({ email: normalizedTarget, emailVerified: false, updatedAt: new Date() }).where(eq(users.id, user.id));
      }
      channel = "email";
    } else {
      let lookup: PhoneLookupResult;
      try { lookup = await checkPhone(params.target); } catch (error) { if (isPhoneProviderFailure(error)) throw new Error("We could not verify this phone number right now. Please try again."); throw error; }
      if (lookup.valid === false) throw new Error(lookup.message || "This phone number is invalid or does not exist.");
      if (lookup.VOIP === true) throw new Error("This phone number cannot be used because it appears to be a VoIP number.");
      normalizedTarget = lookup.formatted || params.target;
      const existing = await db.query.users.findFirst({ where: eq(users.phoneNumber, normalizedTarget) });
      if (existing && existing.id !== user?.id && !(existing.accountStatus === "pending" && !existing.emailVerified && !existing.phoneVerified)) throw new Error("That phone number is already registered.");
      if (registrationChallenge) {
        await db.update(registrationChallenges).set({ contactType: "phone", target: normalizedTarget, normalizedTarget, phoneNumber: normalizedTarget, updatedAt: new Date() }).where(eq(registrationChallenges.id, registrationChallenge.id));
        const memory = { ...((reservation.memory ?? {}) as Record<string, any>) };
        memory.phoneLookup = { ...(memory.phoneLookup ?? {}), phoneNumber: normalizedTarget, lookupStatus: "verified", valid: lookup.valid ?? true, active: lookup.active ?? null, voip: lookup.VOIP ?? null, fraudScore: Number(lookup.fraud_score ?? 0), lineType: lookup.line_type ?? null, carrier: lookup.carrier ?? null, lookupRequestId: lookup.request_id ?? null };
        await db.update(registrationFlowReservations).set({ phoneNumber: normalizedTarget, phoneCountryCode: lookup.country_code?.toUpperCase() ?? reservation.phoneCountryCode, phoneLookupStatus: "verified", phoneValid: lookup.valid ?? true, phoneActive: lookup.active ?? null, phoneVoip: lookup.VOIP ?? null, phoneFraudScore: Number(lookup.fraud_score ?? 0), phoneLineType: lookup.line_type ?? null, phoneCarrier: lookup.carrier ?? null, phoneLookupRequestId: lookup.request_id ?? null, phoneLookupAt: new Date(), memory, registeredTables: [...new Set([...(reservation.registeredTables ?? []), "registration_flow_reservations", "phone"])] as string[] }).where(eq(registrationFlowReservations.id, reservation.id));
      } else if (user) {
        await db.update(users).set({ phoneNumber: normalizedTarget, phoneVerified: false, updatedAt: new Date() }).where(eq(users.id, user.id));
      }
      channel = "sms";
    }

    await db.update(verifications).set({ status: "invalidated", updatedAt: new Date() }).where(and(eq(verifications.id, verification.id), eq(verifications.status, "pending")));
    const purpose = channel === "sms" ? "PHONE_VERIFICATION" : "EMAIL_VERIFICATION";
    const created = await verificationService.createVerification({ userId: user?.id ?? null, purpose, target: normalizedTarget, channel, requestedLength: 6, firstName: registrationChallenge?.firstName ?? user?.firstName ?? undefined, requestIp: registrationChallenge?.requestIp ?? undefined, userAgent: registrationChallenge?.userAgent ?? undefined, deviceId: params.deviceId, sessionId: registrationChallenge?.id ?? verification.sessionId ?? reservation.id });
    const updated = await saveVerificationToFlow(reservation.id, reservation.flowId, created);
    return { success: true, verificationChallengeId: created.challengeId, flowId: maskFlowId(updated.flowId), rawFlowId: updated.flowId, channel, maskedTarget: maskTarget(normalizedTarget, params.contactType), expiresAt: created.expiresAt.toISOString() };
  }
}

export const registrationVerificationService = new RegistrationVerificationService();