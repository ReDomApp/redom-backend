import {
  and,
  eq,
  or,
} from "drizzle-orm";

import { db } from "../../database/db";
import { users } from "../../database/schema";
import { sessions } from "../../database/sessions.schema";
import { verifications } from "../../database/verifications.schema";

import {
  passwordService,
} from "./password.service";

import {
  fraudService,
} from "./fraud.service";

import {
  verificationService,
} from "./verification.service";

import {
  sessionService,
} from "./session.service";

export interface LoginRequest {
  identifier: string;
  password: string;

  ipAddress?: string;
  country?: string;
  region?: string;
  city?: string;

  userAgent?: string;
  platform?: string;
  browser?: string;

  deviceName?: string;
  deviceId?: string;
  deviceType?: string;
  loginSource?: string;
  appVersion?: string;
}

export interface LoginFlowResult {
  success: true;

  message: string;

  requiresVerification: boolean;

  user?: {
    id: string;
    username: string;
    publicId: string;
    profileId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phoneNumber: string | null;
    emailVerified: boolean;
    phoneVerified: boolean;
    accountStatus: string;
  };

  session?: {
    sessionId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  };

  verification?: {
    challengeId: string;
    channel: "sms" | "email" | "whatsapp";
    target: string;
    maskedTarget: string;
    codeLength: number;
    expiresAt: Date;
  };
}

function maskPhone(
  phone: string,
): string {
  const normalized =
    phone.trim();

  if (normalized.length <= 4) {
    return normalized;
  }

  return (
    normalized.slice(0, 3) +
    "*".repeat(
      Math.max(
        0,
        normalized.length - 5,
      ),
    ) +
    normalized.slice(-2)
  );
}

function maskEmail(
  email: string,
): string {
  const normalized =
    email.trim();

  const at =
    normalized.indexOf("@");

  if (at <= 0) {
    return "***";
  }

  const local =
    normalized.slice(0, at);

  const domain =
    normalized.slice(at);

  if (local.length === 1) {
    return `*${domain}`;
  }

  if (local.length === 2) {
    return `${local[0]}*${domain}`;
  }

  return (
    local[0] +
    "*".repeat(
      Math.max(
        1,
        local.length - 2,
      ),
    ) +
    local.slice(-1) +
    domain
  );
}

function publicUser(
  user: typeof users.$inferSelect,
) {
  return {
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
  };
}

export class LoginFlowService {
  async login(
    data: LoginRequest,
  ): Promise<LoginFlowResult> {
    const identifier =
      data.identifier.trim();

    if (!identifier) {
      throw new Error(
        "Login identifier is required.",
      );
    }

    const password =
      data.password;

    if (!password) {
      throw new Error(
        "Password is required.",
      );
    }

    /*
     * Login is deliberately limited to
     * email or phone.
     *
     * Username/publicId/profileId are NOT
     * accepted by this login flow.
     */
    const looksLike15DigitId =
      /^\d{15}$/.test(
        identifier,
      );

    if (looksLike15DigitId) {
      throw new Error(
        "Please use your mobile number or email address to log in.",
      );
    }

    const user =
      await db.query.users.findFirst({
        where: or(
          eq(
            users.email,
            identifier.toLowerCase(),
          ),
          eq(
            users.phoneNumber,
            identifier,
          ),
        ),
      });

    if (!user) {
      throw new Error(
        "Please create an account if you're not a ReDom user.",
      );
    }

    const passwordValid =
      await passwordService.verify(
        password,
        user.passwordHash,
      );

    if (!passwordValid) {
      throw new Error(
        "Invalid credentials.",
      );
    }

    if (
      user.accountStatus ===
      "suspended"
    ) {
      throw new Error(
        "Your account has been suspended.",
      );
    }

    if (
      user.accountStatus ===
      "banned"
    ) {
      throw new Error(
        "Your account has been banned.",
      );
    }

    await fraudService.checkLogin({
      userId: user.id,
      ipAddress: data.ipAddress,
      country: data.country,
      userAgent: data.userAgent,
    });

    const deviceId =
      data.deviceId?.trim();

    const knownDevice =
      Boolean(deviceId) &&
      Boolean(
        await db.query.sessions.findFirst({
          where: and(
            eq(sessions.userId, user.id),
            eq(sessions.deviceId, deviceId!),
          ),
        }),
      );

    if (!knownDevice) {
      const channel =
        user.phoneNumber
          ? "sms"
          : "email";

      const target =
        user.phoneNumber ??
        user.email!;

      const challenge =
        await verificationService.createVerification({
          userId: user.id,
          purpose: "LOGIN_DEVICE_VERIFICATION",
          target,
          channel,
          requestedLength: 6,
          firstName: user.firstName,
          requestIp: data.ipAddress,
          userAgent: data.userAgent,
          deviceId,
          sessionId: undefined,
        });

      const maskedTarget =
        channel === "sms"
          ? maskPhone(target)
          : maskEmail(target);

      return {
        success: true,
        message:
          "New device detected. Verification is required.",
        requiresVerification: true,
        verification: {
          challengeId: challenge.challengeId,
          channel,
          target,
          maskedTarget,
          codeLength: challenge.codeLength,
          expiresAt: challenge.expiresAt,
        },
      };
    }

    const session =
      await sessionService.createSession({
        userId: user.id,
        ipAddress: data.ipAddress,
        country: data.country,
        region: data.region,
        city: data.city,
        userAgent: data.userAgent,
        platform: data.platform,
        browser: data.browser,
        deviceName: data.deviceName,
        deviceId,
        deviceType: data.deviceType,
        loginSource: data.loginSource ?? "mobile",
        appVersion: data.appVersion,
      });

    return {
      success: true,
      message: "Login successful.",
      requiresVerification: false,
      user: publicUser(user),
      session,
    };
  }

  async verifyNewDevice(
    params: {
      challengeId: string;
      code: string;
      ipAddress?: string;
      deviceId: string;
      deviceName?: string;
      deviceType?: string;
      platform?: string;
      browser?: string;
      userAgent?: string;
      country?: string;
      region?: string;
      city?: string;
      loginSource?: string;
      appVersion?: string;
    },
  ) {
    const challenge =
      await db.query.verifications.findFirst({
        where: eq(
          verifications.id,
          params.challengeId,
        ),
      });

    if (!challenge) {
      throw new Error(
        "Verification challenge not found.",
      );
    }

    if (
      challenge.purpose !==
      "LOGIN_DEVICE_VERIFICATION"
    ) {
      throw new Error(
        "Invalid login verification challenge.",
      );
    }

    if (
      challenge.deviceId &&
      challenge.deviceId !== params.deviceId
    ) {
      throw new Error(
        "This verification belongs to another device.",
      );
    }

    if (
      challenge.requestIp &&
      params.ipAddress &&
      challenge.requestIp !== params.ipAddress
    ) {
      throw new Error(
        "The verification request originated from a different network address.",
      );
    }

    const verification =
      await verificationService.verifyVerification({
        challengeId: params.challengeId,
        code: params.code,
        purpose: "LOGIN_DEVICE_VERIFICATION",
      });

    if (!verification.userId) {
      throw new Error(
        "Verification is not associated with an account.",
      );
    }

    const user =
      await db.query.users.findFirst({
        where: eq(
          users.id,
          verification.userId,
        ),
      });

    if (!user) {
      throw new Error(
        "User not found.",
      );
    }

    if (
      user.accountStatus ===
      "suspended"
    ) {
      throw new Error(
        "Your account has been suspended.",
      );
    }

    if (
      user.accountStatus ===
      "banned"
    ) {
      throw new Error(
        "Your account has been banned.",
      );
    }

    await fraudService.checkLogin({
      userId: user.id,
      ipAddress: params.ipAddress,
      country: params.country,
      userAgent: params.userAgent,
    });

    const session =
      await sessionService.createSession({
        userId: user.id,
        ipAddress: params.ipAddress,
        country: params.country,
        region: params.region,
        city: params.city,
        userAgent: params.userAgent,
        platform: params.platform,
        browser: params.browser,
        deviceName: params.deviceName,
        deviceId: params.deviceId,
        deviceType: params.deviceType,
        loginSource: params.loginSource ?? "mobile",
        appVersion: params.appVersion,
      });

    return {
      success: true,
      message:
        "Device verified and login successful.",
      requiresVerification: false,
      user: publicUser(user),
      session,
    };
  }
}

export const loginFlowService =
  new LoginFlowService();