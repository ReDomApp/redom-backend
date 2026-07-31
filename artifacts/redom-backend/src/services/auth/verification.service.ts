import { addMinutes } from "date-fns";
import { and, eq, gt } from "drizzle-orm";

import { db } from "../../database/db";
import { verifications } from "../../database/verifications.schema";

import { emailService } from "./email.service";
import { phoneService } from "./phone.service";
import { passwordService } from "./password.service";

export class VerificationService {
  /**
   * Create an email verification.
   */
  async createEmailVerification(params: {
    userId: string;
    email: string;
    firstName: string;
  }): Promise<void> {
    const code =
      emailService.generateVerificationCode();

    const codeHash =
      await passwordService.hash(code);

    await db
      .delete(verifications)
      .where(
        and(
          eq(verifications.userId, params.userId),
          eq(verifications.type, "email"),
        ),
      );

    await db.insert(verifications).values({
      userId: params.userId,
      type: "email",
      target: params.email,
      codeHash,
      expiresAt: addMinutes(new Date(), 10),
    });

    await emailService.sendVerificationCode(
      params.email,
      params.firstName,
      code,
    );
  }

  /**
   * Create a phone verification.
   */
  async createPhoneVerification(params: {
    userId: string;
    phoneNumber: string;
  }): Promise<void> {
    await db
      .delete(verifications)
      .where(
        and(
          eq(verifications.userId, params.userId),
          eq(verifications.type, "phone"),
        ),
      );

    await phoneService.sendVerificationCode(
      params.phoneNumber,
    );

    await db.insert(verifications).values({
      userId: params.userId,
      type: "phone",
      target: params.phoneNumber,
      codeHash: "",
      expiresAt: addMinutes(new Date(), 10),
    });
  }

  /**
   * Verify an email code.
   */
  async verifyEmailCode(params: {
    userId: string;
    code: string;
  }): Promise<boolean> {
    const verification =
      await db.query.verifications.findFirst({
        where: and(
          eq(verifications.userId, params.userId),
          eq(verifications.type, "email"),
          gt(
            verifications.expiresAt,
            new Date(),
          ),
        ),
      });

    if (!verification) {
      throw new Error(
        "Verification code expired.",
      );
    }

    const valid =
      await passwordService.verify(
        params.code,
        verification.codeHash,
      );

    if (!valid) {
      throw new Error(
        "Invalid verification code.",
      );
    }

    await db
      .delete(verifications)
      .where(eq(verifications.id, verification.id));

    return true;
  }

  /**
   * Verify a phone code.
   */
  async verifyPhoneCode(params: {
    userId: string;
    phoneNumber: string;
    code: string;
  }): Promise<boolean> {
    const verification =
      await db.query.verifications.findFirst({
        where: and(
          eq(verifications.userId, params.userId),
          eq(verifications.type, "phone"),
          gt(
            verifications.expiresAt,
            new Date(),
          ),
        ),
      });

    if (!verification) {
      throw new Error(
        "Verification code expired.",
      );
    }

    const valid =
      await phoneService.verifyCode(
        params.phoneNumber,
        params.code,
      );

    if (!valid) {
      throw new Error(
        "Invalid verification code.",
      );
    }

    await db
      .delete(verifications)
      .where(eq(verifications.id, verification.id));

    return true;
  }
}

export const verificationService =
  new VerificationService();