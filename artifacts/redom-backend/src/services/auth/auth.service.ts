import {
  and,
  eq,
  or,
} from "drizzle-orm";

import { db } from "../../database/db";
import { users } from "../../database/schema";
import { verifications } from "../../database/verifications.schema";

import {
  validateUsername,
} from "../../utils/usernameGenerator";

import { passwordService } from "./password.service";
import { publicIdService } from "./public-id.service";
import { profileIdService } from "./profile-id.service";
import { emailService } from "./email.service";
import { phoneService } from "./phone.service";
import { verificationService } from "./verification.service";
import { sessionService } from "./session.service";
import { fraudService } from "./fraud.service";
import { loginHistoryService } from "./login-history.service";

export class AuthService {
  async register(data: {
    firstName: string;
    lastName: string;
    username: string;
    email?: string;
    phoneNumber?: string;
    password: string;
    dateOfBirth?: string;
    gender?: "male" | "female" | "custom";
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
  }) {
    const username = validateUsername(data.username);
    const email = data.email?.trim()
      ? emailService.validate(data.email)
      : null;
    const phoneNumber = data.phoneNumber?.trim()
      ? phoneService.validate(data.phoneNumber)
      : null;

    if (!email && !phoneNumber) {
      throw new Error(
        "At least one contact method is required: email or phone number.",
      );
    }

    passwordService.validate(data.password);

    const existingUsername = await db.query.users.findFirst({
      where: eq(users.username, username),
    });

    if (existingUsername) {
      throw new Error("Username is already registered.");
    }

    if (email) {
      const existingEmail = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      if (existingEmail) {
        throw new Error("Email address is already registered.");
      }
    }

    if (phoneNumber) {
      const existingPhone = await db.query.users.findFirst({
        where: eq(users.phoneNumber, phoneNumber),
      });

      if (existingPhone) {
        throw new Error("Phone number is already registered.");
      }
    }

    const publicId = await publicIdService.generate();
    const profileId = await profileIdService.generate();
    const passwordHash = await passwordService.hash(data.password);

    const [user] = await db
      .insert(users)
      .values({
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        username,
        publicId,
        profileId,
        email,
        phoneNumber,
        passwordHash,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        emailVerified: false,
        phoneVerified: false,
        accountStatus: "pending",
        profileIdVisibility: "public",
      })
      .returning();

    if (!user) {
      throw new Error("Unable to create account.");
    }

    if (user.email) {
      await verificationService.createEmailVerification({
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
      });
    }

    if (user.phoneNumber) {
      await verificationService.createPhoneVerification({
        userId: user.id,
        phoneNumber: user.phoneNumber,
      });
    }

    await fraudService.checkRegistration({
      userId: user.id,
      email: user.email ?? "",
      phoneNumber: user.phoneNumber ?? "",
      ipAddress: data.ipAddress,
      country: data.country,
      userAgent: data.userAgent,
    });

    return {
      success: true,
      message:
        "Registration completed successfully. Please verify your email address or phone number before logging in.",
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
    };
  }

  async login(data: {
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
  }) {
    const identifier = data.identifier.trim();

    if (!identifier) {
      throw new Error("Login identifier is required.");
    }

    const user = await db.query.users.findFirst({
      where: (users, { or, eq }) =>
        or(
          eq(users.email, identifier),
          eq(users.phoneNumber, identifier),
          eq(users.username, identifier),
          eq(users.publicId, identifier),
          eq(users.profileId, identifier),
        ),
    });

    if (!user) {
      throw new Error("Invalid credentials.");
    }

    const passwordValid = await passwordService.verify(
      data.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      throw new Error("Invalid credentials.");
    }

    if (user.accountStatus === "suspended") {
      throw new Error("Your account has been suspended.");
    }

    if (user.accountStatus === "banned") {
      throw new Error("Your account has been banned.");
    }

    if (user.accountStatus === "pending") {
      throw new Error(
        "Your account is pending verification. Please verify your email address or phone number before logging in.",
      );
    }

    await fraudService.checkLogin({
      userId: user.id,
      ipAddress: data.ipAddress,
      country: data.country,
      userAgent: data.userAgent,
    });

    const session = await sessionService.createSession({
      userId: user.id,
      ipAddress: data.ipAddress,
      country: data.country,
      region: data.region,
      city: data.city,
      userAgent: data.userAgent,
      platform: data.platform,
      browser: data.browser,
      deviceName: data.deviceName,
      deviceId: data.deviceId,
      deviceType: data.deviceType,
      loginSource: data.loginSource,
      appVersion: data.appVersion,
    });

    await loginHistoryService.create({
      userId: user.id,
      sessionId: session.sessionId,
      ipAddress: data.ipAddress,
      country: data.country,
      region: data.region,
      city: data.city,
      deviceName: data.deviceName,
      deviceType: data.deviceType,
      loginSource: data.loginSource,
      appVersion: data.appVersion,
    });

    return {
      success: true,
      message: "Login successful.",
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
      session,
    };
  }

  async verifyEmail(data: { userId: string; code: string }) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, data.userId),
    });

    if (!user) {
      throw new Error("User not found.");
    }

    if (!user.email) {
      throw new Error(
        "No email address is associated with this account.",
      );
    }

    if (user.emailVerified) {
      return {
        success: true,
        message: "Email is already verified.",
      };
    }

    await verificationService.verifyEmailCode({
      userId: user.id,
      code: data.code,
    });

    const nextStatus =
      user.accountStatus === "pending" && !user.phoneNumber
        ? "active"
        : user.accountStatus;

    await db
      .update(users)
      .set({
        emailVerified: true,
        accountStatus: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return {
      success: true,
      message: "Email verified successfully.",
    };
  }

  async verifyPhone(data: {
    userId: string;
    phoneNumber: string;
    code: string;
  }) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, data.userId),
    });

    if (!user) {
      throw new Error("User not found.");
    }

    if (!user.phoneNumber) {
      throw new Error(
        "No phone number is associated with this account.",
      );
    }

    const phoneNumber = phoneService.validate(data.phoneNumber);

    if (phoneNumber !== user.phoneNumber) {
      throw new Error(
        "The phone number does not match this account.",
      );
    }

    if (user.phoneVerified) {
      return {
        success: true,
        message: "Phone number is already verified.",
      };
    }

    await verificationService.verifyPhoneCode({
      userId: user.id,
      phoneNumber: user.phoneNumber,
      code: data.code,
    });

    const nextStatus =
      user.accountStatus === "pending" && !user.email
        ? "active"
        : user.accountStatus;

    await db
      .update(users)
      .set({
        phoneVerified: true,
        accountStatus: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return {
      success: true,
      message: "Phone number verified successfully.",
    };
  }

  async resendEmailCode(data: { userId: string }) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, data.userId),
    });

    if (!user) {
      throw new Error("User not found.");
    }

    if (!user.email) {
      throw new Error(
        "No email address is associated with this account.",
      );
    }

    if (user.emailVerified) {
      throw new Error("Email is already verified.");
    }

    await verificationService.createEmailVerification({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
    });

    return {
      success: true,
      message: "A new email verification code has been sent.",
    };
  }

  async resendPhoneCode(data: { userId: string }) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, data.userId),
    });

    if (!user) {
      throw new Error("User not found.");
    }

    if (!user.phoneNumber) {
      throw new Error(
        "No phone number is associated with this account.",
      );
    }

    if (user.phoneVerified) {
      throw new Error("Phone number is already verified.");
    }

    await verificationService.createPhoneVerification({
      userId: user.id,
      phoneNumber: user.phoneNumber,
    });

    return {
      success: true,
      message: "A new phone verification code has been sent.",
    };
  }

  async forgotPassword(data: { identifier: string }) {
    const identifier = data.identifier.trim();

    if (!identifier) {
      throw new Error("Email address or phone number is required.");
    }

    const user = await db.query.users.findFirst({
      where: or(
        eq(users.email, identifier.toLowerCase()),
        eq(users.phoneNumber, identifier),
      ),
    });

    if (!user) {
      return {
        success: true,
        message:
          "If an account matches that contact information, a password reset code will be sent.",
      };
    }

    const channel = user.phoneNumber ? "sms" : "email";
    const target = user.phoneNumber ?? user.email!;

    await verificationService.createVerification({
      userId: user.id,
      purpose: "PASSWORD_RESET",
      target,
      channel,
      requestedLength: 6,
      firstName: user.firstName,
    });

    return {
      success: true,
      message:
        "If an account matches that contact information, a password reset code will be sent.",
    };
  }

  async resetPassword(data: {
    userId: string;
    code: string;
    password: string;
  }) {
    passwordService.validate(data.password);

    const user = await db.query.users.findFirst({
      where: eq(users.id, data.userId),
    });

    if (!user) {
      throw new Error("User not found.");
    }

    const challenge = await db.query.verifications.findFirst({
      where: and(
        eq(verifications.userId, user.id),
        eq(verifications.purpose, "PASSWORD_RESET"),
        eq(verifications.status, "pending"),
      ),
    });

    if (!challenge) {
      throw new Error("Password reset challenge not found or expired.");
    }

    await verificationService.verifyVerification({
      challengeId: challenge.id,
      code: data.code,
      purpose: "PASSWORD_RESET",
    });

    const passwordHash = await passwordService.hash(data.password);

    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return {
      success: true,
      message: "Password reset successfully.",
    };
  }

  async logout(data: {
    userId: string;
    sessionId: string;
  }) {
    return sessionService.revokeSession(
      data.userId,
      data.sessionId,
    );
  }

  async refreshSession(data: { refreshToken: string }) {
    return sessionService.refreshSession(
      data.refreshToken,
    );
  }
}

export const authService = new AuthService();
