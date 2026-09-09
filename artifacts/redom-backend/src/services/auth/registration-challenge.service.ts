import { randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "../../database/db";
import { registrationChallenges } from "../../database/registration-challenges.schema";
import { users } from "../../database/schema";
import { verifications } from "../../database/verifications.schema";
import { fraudService } from "./fraud.service";
import { passwordService } from "./password.service";
import { phoneService } from "./phone.service";
import { emailService } from "./email.service";
import { publicIdService } from "./public-id.service";
import { profileIdService } from "./profile-id.service";
import { verificationService } from "./verification.service";
import { registrationFlowReservationService } from "./registration-flow-reservation.service";

export type RegistrationStep = "contact" | "identity" | "username" | "profile" | "password" | "review";
const CHALLENGE_TTL_MS = 30 * 60 * 1000;
const FLOW_ID_MIN_LENGTH = 6;
const FLOW_ID_MAX_LENGTH = 16;
const FLOW_ID_GENERATION_ATTEMPTS = 12;

type RegistrationContactType = "phone" | "email";

function maskFlowId(flowId: string) { return flowId.length > 4 ? `${flowId.slice(0, 4)}••••••••✓` : `${flowId}✓`; }
function generateNumericFlowId(): string {
  const length = randomInt(FLOW_ID_MIN_LENGTH, FLOW_ID_MAX_LENGTH + 1);
  const bytes = randomBytes(length);
  let flowId = "";
  for (let index = 0; index < length; index += 1) {
    let byte = bytes[index]!;
    while (byte >= 250) byte = randomBytes(1)[0]!;
    flowId += String(byte % 10);
  }
  return flowId;
}
function maskTarget(target: string, type: RegistrationContactType) {
  if (type === "phone") { const digits = target.replace(/\s/g, ""); return digits.length > 7 ? `${digits.slice(0, 5)}•••${digits.slice(-4)}` : `${digits.slice(0, 2)}••••`; }
  const [local, domain] = target.split("@");
  if (!local || !domain) return "••••";
  return `${local.slice(0, 2)}•••@${domain}`;
}

export class RegistrationChallengeService {
  private async deleteExpired(challengeId?: string) {
    const now = new Date();
    await db.delete(registrationChallenges).where(challengeId ? and(eq(registrationChallenges.id, challengeId), lte(registrationChallenges.expiresAt, now)) : lte(registrationChallenges.expiresAt, now));
  }
  async purgeExpired() { await this.deleteExpired(); }
  private async getActive(challengeId: string) {
    await this.deleteExpired(challengeId);
    const challenge = await db.query.registrationChallenges.findFirst({ where: and(eq(registrationChallenges.id, challengeId), eq(registrationChallenges.status, "pending"), gt(registrationChallenges.expiresAt, new Date())) });
    if (!challenge) throw new Error("Registration flow not found or expired.");
    return challenge;
  }
  private async generateFlowId() {
    for (let attempt = 0; attempt < FLOW_ID_GENERATION_ATTEMPTS; attempt += 1) {
      const flowId = generateNumericFlowId();
      const active = await db.query.registrationChallenges.findFirst({ where: and(eq(registrationChallenges.flowId, flowId), gt(registrationChallenges.expiresAt, new Date())) });
      if (!active) return flowId;
    }
    throw new Error("Unable to allocate a unique registration Flow ID.");
  }
  async start(params: { contactType: RegistrationContactType; target: string; requestIp?: string; userAgent?: string; deviceId?: string; reservationId?: string; flowId?: string; }) {
    await this.deleteExpired();
    const normalizedTarget = params.contactType === "phone" ? phoneService.validate(params.target) : emailService.validate(params.target);
    const existing = await db.query.users.findFirst({ where: params.contactType === "phone" ? eq(users.phoneNumber, normalizedTarget) : eq(users.email, normalizedTarget) });
    if (existing) throw new Error(params.contactType === "phone" ? "That phone number is already registered." : "That email address is already registered.");

    let flowId: string;
    let reservedFirstName: string | null = null;
    let reservedLastName: string | null = null;
    if (params.reservationId || params.flowId) {
      if (!params.reservationId || !params.flowId) throw new Error("Registration Flow ID reservation is incomplete.");
      const reservation = await registrationFlowReservationService.consume(params.reservationId, params.flowId, params.deviceId);
      flowId = reservation.flowId;
      reservedFirstName = reservation.firstName;
      reservedLastName = reservation.lastName;
    } else {
      flowId = await this.generateFlowId();
    }

    const now = new Date();
    const [challenge] = await db.insert(registrationChallenges).values({ flowId, contactType: params.contactType, target: normalizedTarget, normalizedTarget, firstName: reservedFirstName, lastName: reservedLastName, currentStep: reservedFirstName && reservedLastName ? "identity" : "contact", status: "pending", requestIp: params.requestIp, userAgent: params.userAgent, deviceId: params.deviceId, expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS), createdAt: now, updatedAt: now }).returning();
    if (!challenge) throw new Error("Unable to start registration flow.");
    return { success: true, challengeId: challenge.id, flowId: maskFlowId(challenge.flowId), contactType: challenge.contactType as RegistrationContactType, maskedTarget: maskTarget(normalizedTarget, params.contactType), expiresAt: challenge.expiresAt.toISOString(), currentStep: challenge.currentStep as RegistrationStep };
  }
  async saveStep(params: { challengeId: string; step: RegistrationStep; data: { firstName?: string; lastName?: string; username?: string; email?: string; phoneNumber?: string; dateOfBirth?: string; gender?: "male" | "female" | "custom"; password?: string; }; }) {
    const challenge = await this.getActive(params.challengeId);
    const patch: Record<string, unknown> = { currentStep: params.step, updatedAt: new Date() };
    if (params.data.firstName !== undefined) patch.firstName = params.data.firstName.trim();
    if (params.data.lastName !== undefined) patch.lastName = params.data.lastName.trim();
    if (params.data.username !== undefined) patch.username = params.data.username.trim();
    if (params.data.dateOfBirth !== undefined) patch.dateOfBirth = params.data.dateOfBirth;
    if (params.data.gender !== undefined) patch.gender = params.data.gender;
    if (params.data.email !== undefined) { const email = emailService.validate(params.data.email); if (challenge.contactType === "email" && email !== challenge.normalizedTarget) throw new Error("This email address does not match the registration flow."); patch.email = email; }
    if (params.data.phoneNumber !== undefined) { const phone = phoneService.validate(params.data.phoneNumber); if (challenge.contactType === "phone" && phone !== challenge.normalizedTarget) throw new Error("This phone number does not match the registration flow."); patch.phoneNumber = phone; }
    if (params.data.password !== undefined) { passwordService.validate(params.data.password); patch.passwordHash = await passwordService.hash(params.data.password); }
    await db.update(registrationChallenges).set(patch).where(and(eq(registrationChallenges.id, challenge.id), eq(registrationChallenges.status, "pending")));
    const updated = await this.getActive(challenge.id);
    return { success: true, challengeId: updated.id, flowId: maskFlowId(updated.flowId), maskedTarget: maskTarget(updated.normalizedTarget, updated.contactType as RegistrationContactType), expiresAt: updated.expiresAt.toISOString(), currentStep: updated.currentStep as RegistrationStep };
  }
  async complete(params: { challengeId: string; submitted?: { email?: string; phoneNumber?: string } }) {
    const challenge = await this.getActive(params.challengeId);
    if (params.submitted?.email !== undefined) { const submittedEmail = emailService.validate(params.submitted.email); if (challenge.contactType === "email" && submittedEmail !== challenge.normalizedTarget) throw new Error("The email address does not match this registration flow."); if (challenge.contactType !== "email" && challenge.email !== submittedEmail) throw new Error("The email address does not match this registration flow."); }
    if (params.submitted?.phoneNumber !== undefined) { const submittedPhone = phoneService.validate(params.submitted.phoneNumber); if (challenge.contactType === "phone" && submittedPhone !== challenge.normalizedTarget) throw new Error("The phone number does not match this registration flow."); if (challenge.contactType !== "phone" && challenge.phoneNumber !== submittedPhone) throw new Error("The phone number does not match this registration flow."); }
    if (!challenge.firstName || !challenge.lastName || !challenge.username) throw new Error("Registration details are incomplete.");
    if (!challenge.dateOfBirth || !challenge.gender || !challenge.passwordHash) throw new Error("Registration security details are incomplete.");
    const email = challenge.email ?? (challenge.contactType === "email" ? challenge.normalizedTarget : null);
    const phoneNumber = challenge.phoneNumber ?? (challenge.contactType === "phone" ? challenge.normalizedTarget : null);
    if (!email && !phoneNumber) throw new Error("A contact method is required.");
    if (await db.query.users.findFirst({ where: eq(users.username, challenge.username) })) throw new Error("Username is already registered.");
    if (email && await db.query.users.findFirst({ where: eq(users.email, email) })) throw new Error("Email address is already registered.");
    if (phoneNumber && await db.query.users.findFirst({ where: eq(users.phoneNumber, phoneNumber) })) throw new Error("Phone number is already registered.");
    const publicId = await publicIdService.generate();
    const profileId = await profileIdService.generate();
    const [user] = await db.insert(users).values({ firstName: challenge.firstName, lastName: challenge.lastName, username: challenge.username, publicId, profileId, email, phoneNumber, passwordHash: challenge.passwordHash, dateOfBirth: challenge.dateOfBirth, gender: challenge.gender as "male" | "female" | "custom", emailVerified: false, phoneVerified: false, accountStatus: "pending", profileIdVisibility: "public" }).returning();
    if (!user) throw new Error("Unable to create account.");
    const verification = await verificationService.createVerification({ userId: user.id, purpose: challenge.contactType === "phone" ? "PHONE_VERIFICATION" : "EMAIL_VERIFICATION", target: challenge.normalizedTarget, channel: challenge.contactType === "phone" ? "sms" : "email", requestedLength: 6, firstName: user.firstName, requestIp: challenge.requestIp ?? undefined, userAgent: challenge.userAgent ?? undefined, deviceId: challenge.deviceId ?? undefined });
    await fraudService.checkRegistration({ userId: user.id, email: user.email ?? "", phoneNumber: user.phoneNumber ?? "", ipAddress: challenge.requestIp ?? undefined, userAgent: challenge.userAgent ?? undefined });
    const flowId = maskFlowId(challenge.flowId);
    const contactType = challenge.contactType as RegistrationContactType;
    const verificationResponse = { challengeId: verification.challengeId, channel: verification.channel, target: verification.target, maskedTarget: maskTarget(verification.normalizedTarget, contactType), codeLength: verification.codeLength, expiresAt: verification.expiresAt };
    await db.delete(registrationChallenges).where(eq(registrationChallenges.id, challenge.id));
    return { success: true, flowId, user: { id: user.id, username: user.username, publicId: user.publicId, profileId: user.profileId, firstName: user.firstName, lastName: user.lastName, email: user.email, phoneNumber: user.phoneNumber, emailVerified: user.emailVerified, phoneVerified: user.phoneVerified, accountStatus: user.accountStatus }, verification: verificationResponse };
  }
  async verify(params: { verificationChallengeId: string; code: string }) {
    const verification = await db.query.verifications.findFirst({ where: eq(verifications.id, params.verificationChallengeId) });
    if (!verification || !verification.userId) throw new Error("Verification challenge not found.");
    if (!["PHONE_VERIFICATION", "EMAIL_VERIFICATION"].includes(verification.purpose)) throw new Error("Verification challenge is invalid for registration.");
    const user = await db.query.users.findFirst({ where: eq(users.id, verification.userId) });
    if (!user) throw new Error("Registration account not found.");
    const expectedTarget = verification.purpose === "PHONE_VERIFICATION" ? user.phoneNumber : user.email;
    if (!expectedTarget || expectedTarget !== verification.normalizedTarget) throw new Error("Verification target does not match the registered account.");
    await verificationService.verifyVerification({ challengeId: verification.id, code: params.code, purpose: verification.purpose as "PHONE_VERIFICATION" | "EMAIL_VERIFICATION" });
    const verifiedAt = new Date();
    await db.update(users).set({ ...(verification.purpose === "PHONE_VERIFICATION" ? { phoneVerified: true } : { emailVerified: true }), accountStatus: "active", updatedAt: verifiedAt }).where(eq(users.id, verification.userId));
    return { success: true, message: "Account verified successfully." };
  }
  async getFlow(challengeId: string) {
    const challenge = await this.getActive(challengeId);
    return { success: true, challengeId: challenge.id, flowId: maskFlowId(challenge.flowId), contactType: challenge.contactType as RegistrationContactType, maskedTarget: maskTarget(challenge.normalizedTarget, challenge.contactType as RegistrationContactType), currentStep: challenge.currentStep as RegistrationStep, expiresAt: challenge.expiresAt.toISOString() };
  }
}

export const registrationChallengeService = new RegistrationChallengeService();
