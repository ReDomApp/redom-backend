import { and, eq, gt, or } from "drizzle-orm";

import { db } from "../../database/db";
import { registrationChallenges } from "../../database/registration-challenges.schema";
import { users } from "../../database/schema";

import { fraudService } from "./fraud.service";
import { passwordService } from "./password.service";
import { phoneService } from "./phone.service";
import { emailService } from "./email.service";
import { publicIdService } from "./public-id.service";
import { profileIdService } from "./profile-id.service";
import { verificationService } from "./verification.service";

export type RegistrationStep =
  | "contact"
  | "identity"
  | "username"
  | "profile"
  | "password"
  | "review";

const CHALLENGE_TTL_MS = 30 * 60 * 1000;

function maskChallengeId(id: string) {
  return `${id.slice(0, 4).toUpperCase()}••••••••✓`;
}

function maskTarget(target: string, type: "phone" | "email") {
  if (type === "phone") {
    const digits = target.replace(/\s/g, "");
    return digits.length > 7
      ? `${digits.slice(0, 5)}•••${digits.slice(-4)}`
      : `${digits.slice(0, 2)}••••`;
  }

  const [local, domain] = target.split("@");
  if (!local || !domain) return "••••";
  return `${local.slice(0, 2)}•••@${domain}`;
}

export class RegistrationChallengeService {
  private async getActive(challengeId: string) {
    const challenge = await db.query.registrationChallenges.findFirst({
      where: and(
        eq(registrationChallenges.id, challengeId),
        eq(registrationChallenges.status, "pending"),
        gt(registrationChallenges.expiresAt, new Date()),
      ),
    });

    if (!challenge) {
      throw new Error("Registration flow not found or expired.");
    }

    return challenge;
  }

  async start(params: {
    contactType: "phone" | "email";
    target: string;
    requestIp?: string;
    userAgent?: string;
    deviceId?: string;
  }) {
    const normalizedTarget =
      params.contactType === "phone"
        ? phoneService.validate(params.target)
        : emailService.validate(params.target);

    const existing = await db.query.users.findFirst({
      where:
        params.contactType === "phone"
          ? eq(users.phoneNumber, normalizedTarget)
          : eq(users.email, normalizedTarget),
    });

    if (existing) {
      throw new Error(
        params.contactType === "phone"
          ? "That phone number is already registered."
          : "That email address is already registered.",
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);

    const [challenge] = await db
      .insert(registrationChallenges)
      .values({
        contactType: params.contactType,
        target: normalizedTarget,
        normalizedTarget,
        currentStep: "contact",
        status: "pending",
        requestIp: params.requestIp,
        userAgent: params.userAgent,
        deviceId: params.deviceId,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!challenge) throw new Error("Unable to start registration flow.");

    return {
      success: true,
      challengeId: challenge.id,
      flowId: maskChallengeId(challenge.id),
      contactType: challenge.contactType as "phone" | "email",
      maskedTarget: maskTarget(normalizedTarget, params.contactType),
      expiresAt: challenge.expiresAt.toISOString(),
      currentStep: challenge.currentStep as RegistrationStep,
    };
  }

  async saveStep(params: {
    challengeId: string;
    step: RegistrationStep;
    data: {
      firstName?: string;
      lastName?: string;
      username?: string;
      email?: string;
      phoneNumber?: string;
      dateOfBirth?: string;
      gender?: "male" | "female" | "custom";
      password?: string;
    };
  }) {
    const challenge = await this.getActive(params.challengeId);
    const patch: Record<string, unknown> = {
      currentStep: params.step,
      updatedAt: new Date(),
    };

    if (params.data.firstName !== undefined) patch.firstName = params.data.firstName.trim();
    if (params.data.lastName !== undefined) patch.lastName = params.data.lastName.trim();
    if (params.data.username !== undefined) patch.username = params.data.username.trim();
    if (params.data.dateOfBirth !== undefined) patch.dateOfBirth = params.data.dateOfBirth;
    if (params.data.gender !== undefined) patch.gender = params.data.gender;

    if (params.data.email !== undefined) {
      const email = emailService.validate(params.data.email);
      if (challenge.contactType === "email" && email !== challenge.normalizedTarget) {
        throw new Error("This email address does not match the registration flow.");
      }
      patch.email = email;
    }

    if (params.data.phoneNumber !== undefined) {
      const phone = phoneService.validate(params.data.phoneNumber);
      if (challenge.contactType === "phone" && phone !== challenge.normalizedTarget) {
        throw new Error("This phone number does not match the registration flow.");
      }
      patch.phoneNumber = phone;
    }

    if (params.data.password !== undefined) {
      passwordService.validate(params.data.password);
      patch.passwordHash = await passwordService.hash(params.data.password);
    }

    await db
      .update(registrationChallenges)
      .set(patch)
      .where(
        and(
          eq(registrationChallenges.id, challenge.id),
          eq(registrationChallenges.status, "pending"),
        ),
      );

    const updated = await this.getActive(challenge.id);

    return {
      success: true,
      challengeId: updated.id,
      flowId: maskChallengeId(updated.id),
      maskedTarget: maskTarget(updated.normalizedTarget, updated.contactType as "phone" | "email"),
      expiresAt: updated.expiresAt.toISOString(),
      currentStep: updated.currentStep as RegistrationStep,
    };
  }

  async complete(params: {
    challengeId: string;
    submitted?: {
      email?: string;
      phoneNumber?: string;
    };
  }) {
    const challenge = await this.getActive(params.challengeId);

    if (params.submitted?.email !== undefined) {
      const submittedEmail = emailService.validate(params.submitted.email);
      if (challenge.email !== submittedEmail) {
        throw new Error("The email address does not match this registration flow.");
      }
    }

    if (params.submitted?.phoneNumber !== undefined) {
      const submittedPhone = phoneService.validate(params.submitted.phoneNumber);
      if (challenge.phoneNumber !== submittedPhone) {
        throw new Error("The phone number does not match this registration flow.");
      }
    }

    if (!challenge.firstName || !challenge.lastName || !challenge.username) {
      throw new Error("Registration details are incomplete.");
    }
    if (!challenge.dateOfBirth || !challenge.gender || !challenge.passwordHash) {
      throw new Error("Registration security details are incomplete.");
    }

    const email = challenge.email ?? (challenge.contactType === "email" ? challenge.normalizedTarget : null);
    const phoneNumber = challenge.phoneNumber ?? (challenge.contactType === "phone" ? challenge.normalizedTarget : null);

    if (!email && !phoneNumber) {
      throw new Error("A contact method is required.");
    }

    const usernameExists = await db.query.users.findFirst({
      where: eq(users.username, challenge.username),
    });
    if (usernameExists) throw new Error("Username is already registered.");

    const existingContact = await db.query.users.findFirst({
      where: or(
        email ? eq(users.email, email) : undefined,
        phoneNumber ? eq(users.phoneNumber, phoneNumber) : undefined,
      ),
    });
    if (existingContact) throw new Error("One of the contact methods is already registered.");

    const publicId = await publicIdService.generate();
    const profileId = await profileIdService.generate();

    const [user] = await db
      .insert(users)
      .values({
        firstName: challenge.firstName,
        lastName: challenge.lastName,
        username: challenge.username,
        publicId,
        profileId,
        email,
        phoneNumber,
        passwordHash: challenge.passwordHash,
        dateOfBirth: challenge.dateOfBirth,
        gender: challenge.gender as "male" | "female" | "custom",
        emailVerified: false,
        phoneVerified: false,
        accountStatus: "pending",
        profileIdVisibility: "public",
      })
      .returning();

    if (!user) throw new Error("Unable to create account.");

    const verificationTarget = challenge.normalizedTarget;
    const verification = await verificationService.createVerification({
      userId: user.id,
      purpose: challenge.contactType === "phone" ? "PHONE_VERIFICATION" : "EMAIL_VERIFICATION",
      target: verificationTarget,
      channel: challenge.contactType === "phone" ? "sms" : "email",
      requestedLength: 6,
      firstName: user.firstName,
      requestIp: challenge.requestIp ?? undefined,
      userAgent: challenge.userAgent ?? undefined,
      deviceId: challenge.deviceId ?? undefined,
    });

    await fraudService.checkRegistration({
      userId: user.id,
      email: user.email ?? "",
      phoneNumber: user.phoneNumber ?? "",
      ipAddress: challenge.requestIp ?? undefined,
      userAgent: challenge.userAgent ?? undefined,
    });

    await db
      .update(registrationChallenges)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(registrationChallenges.id, challenge.id));

    return {
      success: true,
      challengeId: challenge.id,
      flowId: maskChallengeId(challenge.id),
      user: {
        id: user.id,
        username: user.username,
        publicId: user.publicId,
        profileId: user.profileId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        accountStatus: user.accountStatus,
      },
      verification: {
        challengeId: verification.challengeId,
        channel: verification.channel,
        target: verification.target,
        maskedTarget: maskTarget(verification.normalizedTarget, challenge.contactType),
        codeLength: verification.codeLength,
        expiresAt: verification.expiresAt,
      },
    };
  }

  async getFlow(challengeId: string) {
    const challenge = await this.getActive(challengeId);
    return {
      success: true,
      challengeId: challenge.id,
      flowId: maskChallengeId(challenge.id),
      contactType: challenge.contactType,
      maskedTarget: maskTarget(challenge.normalizedTarget, challenge.contactType as "phone" | "email"),
      currentStep: challenge.currentStep as RegistrationStep,
      expiresAt: challenge.expiresAt.toISOString(),
    };
  }
}

export const registrationChallengeService = new RegistrationChallengeService();
