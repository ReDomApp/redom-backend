import { eq } from "drizzle-orm";

import { db } from "../../database/db";
import { users } from "../../database/schema";

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
    email: string;
    phoneNumber: string;
    password: string;
    dateOfBirth?: string;
    gender?: string;

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
    const email =
      emailService.validate(
        data.email,
      );

    const phoneNumber =
      phoneService.validate(
        data.phoneNumber,
      );

    passwordService.validate(
      data.password,
    );

    const existingEmail =
      await db.query.users.findFirst({
        where: eq(
          users.email,
          email,
        ),
      });

    if (existingEmail) {
      throw new Error(
        "Email address is already registered.",
      );
    }

    const existingPhone =
      await db.query.users.findFirst({
        where: eq(
          users.phoneNumber,
          phoneNumber,
        ),
      });

    if (existingPhone) {
      throw new Error(
        "Phone number is already registered.",
      );
    }

    const publicId =
      await publicIdService.generate();

    const profileId =
      await profileIdService.generate();

    const passwordHash =
      await passwordService.hash(
        data.password,
      );

    const [user] =
      await db
        .insert(users)
        .values({
          firstName:
            data.firstName.trim(),
          lastName:
            data.lastName.trim(),
          username:
            publicId,
          profileId,
          email,
          phoneNumber,
          passwordHash,
          dateOfBirth:
            data.dateOfBirth,
          gender:
            data.gender,
          emailVerified:
            false,
          phoneVerified:
            false,
          accountStatus:
            "pending",
          profileIdVisibility:
            "public",
        })
        .returning();

    if (!user) {
      throw new Error(
        "Unable to create account.",
      );
    }

    await verificationService.createEmailVerification({
      userId: user.id,
      email: user.email,
      firstName:
        user.firstName,
    });

    await verificationService.createPhoneVerification({
      userId: user.id,
      phoneNumber:
        user.phoneNumber,
    });

    await fraudService.checkRegistration({
      userId: user.id,
      email: user.email,
      phoneNumber:
        user.phoneNumber,
      ipAddress:
        data.ipAddress,
      country:
        data.country,
      userAgent:
        data.userAgent,
    });

    const session =
      await sessionService.createSession({
        userId: user.id,
        profileId:
          user.profileId,

        ipAddress:
          data.ipAddress,
        country:
          data.country,
        region:
          data.region,
        city:
          data.city,

        userAgent:
          data.userAgent,
        platform:
          data.platform,
        browser:
          data.browser,

        deviceName:
          data.deviceName,
        deviceId:
          data.deviceId,
        deviceType:
          data.deviceType,
        loginSource:
          data.loginSource,
        appVersion:
          data.appVersion,
      });

    await loginHistoryService.create({
      userId: user.id,
      sessionId:
        session.sessionId,

      ipAddress:
        data.ipAddress,
      country:
        data.country,
      region:
        data.region,
      city:
        data.city,

      deviceName:
        data.deviceName,
      deviceType:
        data.deviceType,

      loginSource:
        data.loginSource,
      appVersion:
        data.appVersion,
    });

    return {
      success: true,
      message:
        "Registration completed successfully. Please verify your email address and phone number.",
      user: {
        id: user.id,
        publicId:
          user.username,
        profileId:
          user.profileId,
        firstName:
          user.firstName,
        lastName:
          user.lastName,
        email:
          user.email,
        phoneNumber:
          user.phoneNumber,
        emailVerified:
          user.emailVerified,
        phoneVerified:
          user.phoneVerified,
        accountStatus:
          user.accountStatus,
      },
      session,
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
    const identifier =
      data.identifier.trim();

    const user =
      await db.query.users.findFirst({
        where: (
          users,
          { or, eq },
        ) =>
          or(
            eq(
              users.email,
              identifier,
            ),
            eq(
              users.phoneNumber,
              identifier,
            ),
            eq(
              users.username,
              identifier,
            ),
            eq(
              users.profileId,
              identifier,
            ),
          ),
      });

    if (!user) {
      throw new Error(
        "Invalid credentials.",
      );
    }

    const passwordValid =
      await passwordService.verify(
        data.password,
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
      ipAddress:
        data.ipAddress,
      country:
        data.country,
      userAgent:
        data.userAgent,
    });

    const session =
      await sessionService.createSession({
        userId: user.id,
        profileId:
          user.profileId,

        ipAddress:
          data.ipAddress,
        country:
          data.country,
        region:
          data.region,
        city:
          data.city,

        userAgent:
          data.userAgent,
        platform:
          data.platform,
        browser:
          data.browser,

        deviceName:
          data.deviceName,
        deviceId:
          data.deviceId,
        deviceType:
          data.deviceType,
        loginSource:
          data.loginSource,
        appVersion:
          data.appVersion,
      });

    await loginHistoryService.create({
      userId: user.id,
      sessionId:
        session.sessionId,

      ipAddress:
        data.ipAddress,
      country:
        data.country,
      region:
        data.region,
      city:
        data.city,

      deviceName:
        data.deviceName,
      deviceType:
        data.deviceType,

      loginSource:
        data.loginSource,
      appVersion:
        data.appVersion,
    });

    return {
      success: true,
      message:
        "Login successful.",
      user: {
        id: user.id,
        publicId:
          user.username,
        profileId:
          user.profileId,
        firstName:
          user.firstName,
        lastName:
          user.lastName,
        email:
          user.email,
        phoneNumber:
          user.phoneNumber,
        emailVerified:
          user.emailVerified,
        phoneVerified:
          user.phoneVerified,
        accountStatus:
          user.accountStatus,
      },
      session,
    };
  }

  async verifyEmail(data: {
    userId: string;
    code: string;
  }) {
    const user =
      await db.query.users.findFirst({
        where: eq(
          users.id,
          data.userId,
        ),
      });

    if (!user) {
      throw new Error(
        "User not found.",
      );
    }

    await verificationService.verifyEmailCode({
      userId: user.id,
      code: data.code,
    });

    const accountStatus =
      user.phoneVerified
        ? "active"
        : user.accountStatus;

    await db
      .update(users)
      .set({
        emailVerified:
          true,
        accountStatus,
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          users.id,
          user.id,
        ),
      );

    return {
      success: true,
      message:
        "Email verified successfully.",
    };
  }

  async verifyPhone(data: {
    userId: string;
    phoneNumber: string;
    code: string;
  }) {
    const phoneNumber =
      phoneService.validate(
        data.phoneNumber,
      );

    const user =
      await db.query.users.findFirst({
        where: eq(
          users.id,
          data.userId,
        ),
      });

    if (!user) {
      throw new Error(
        "User not found.",
      );
    }

    await verificationService.verifyPhoneCode({
      userId: user.id,
      phoneNumber,
      code: data.code,
    });

    const accountStatus =
      user.emailVerified
        ? "active"
        : user.accountStatus;

    await db
      .update(users)
      .set({
        phoneVerified:
          true,
        accountStatus,
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          users.id,
          user.id,
        ),
      );

    return {
      success: true,
      message:
        "Phone number verified successfully.",
    };
  }

  async resendEmailCode(data: {
    userId: string;
  }) {
    const user =
      await db.query.users.findFirst({
        where: eq(
          users.id,
          data.userId,
        ),
      });

    if (!user) {
      throw new Error(
        "User not found.",
      );
    }

    if (user.emailVerified) {
      throw new Error(
        "Email is already verified.",
      );
    }

    await verificationService.createEmailVerification({
      userId: user.id,
      email: user.email,
      firstName:
        user.firstName,
    });

    return {
      success: true,
      message:
        "A new email verification code has been sent.",
    };
  }

  async resendPhoneCode(data: {
    userId: string;
  }) {
    const user =
      await db.query.users.findFirst({
        where: eq(
          users.id,
          data.userId,
        ),
      });

    if (!user) {
      throw new Error(
        "User not found.",
      );
    }

    if (user.phoneVerified) {
      throw new Error(
        "Phone number is already verified.",
      );
    }

    await verificationService.createPhoneVerification({
      userId: user.id,
      phoneNumber:
        user.phoneNumber,
    });

    return {
      success: true,
      message:
        "A new phone verification code has been sent.",
    };
  }

  async forgotPassword(data: {
    identifier: string;
    ipAddress?: string;
    country?: string;
  }) {
    await fraudService.checkPasswordReset({
      ipAddress:
        data.ipAddress,
      country:
        data.country,
    });

    const identifier =
      data.identifier.trim();

    const user =
      await db.query.users.findFirst({
        where: (
          users,
          { or, eq },
        ) =>
          or(
            eq(
              users.email,
              identifier,
            ),
            eq(
              users.phoneNumber,
              identifier,
            ),
            eq(
              users.username,
              identifier,
            ),
            eq(
              users.profileId,
              identifier,
            ),
          ),
      });

    if (!user) {
      return {
        success: true,
        message:
          "If the account exists, a password reset code has been sent.",
      };
    }

    if (
      identifier.includes("@") ||
      identifier === user.email
    ) {
      await verificationService.createEmailVerification({
        userId: user.id,
        email: user.email,
        firstName:
          user.firstName,
      });
    } else {
      await verificationService.createPhoneVerification({
        userId: user.id,
        phoneNumber:
          user.phoneNumber,
      });
    }

    return {
      success: true,
      message:
        "A password reset verification code has been sent.",
    };
  }

  async resetPassword(data: {
    userId: string;
    password: string;
    code: string;
    method:
      | "email"
      | "phone";
  }) {
    const user =
      await db.query.users.findFirst({
        where: eq(
          users.id,
          data.userId,
        ),
      });

    if (!user) {
      throw new Error(
        "User not found.",
      );
    }

    passwordService.validate(
      data.password,
    );

    if (
      data.method ===
      "email"
    ) {
      await verificationService.verifyEmailCode({
        userId: user.id,
        code: data.code,
      });
    } else {
      await verificationService.verifyPhoneCode({
        userId: user.id,
        phoneNumber:
          user.phoneNumber,
        code: data.code,
      });
    }

    const passwordHash =
      await passwordService.hash(
        data.password,
      );

    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          users.id,
          user.id,
        ),
      );

    await sessionService.revokeAllSessions(
      user.id,
    );

    return {
      success: true,
      message:
        "Password changed successfully. Please sign in again.",
    };
  }

  async logout(data: {
    userId: string;
    sessionId: string;
  }) {
    await sessionService.revokeSession(
      data.sessionId,
      data.userId,
    );

    await loginHistoryService.logout(
      data.sessionId,
    );

    return {
      success: true,
      message:
        "Logged out successfully.",
    };
  }

  async refreshSession(data: {
    refreshToken: string;
  }) {
    const session =
      await sessionService.refreshSession(
        data.refreshToken,
      );

    return {
      success: true,
      message:
        "Session refreshed successfully.",
      session,
    };
  }
}

export const authService =
  new AuthService();