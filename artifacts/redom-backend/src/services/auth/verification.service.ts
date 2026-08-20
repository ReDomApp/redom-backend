import {
  addMinutes,
} from "date-fns";

import {
  and,
  eq,
  gt,
} from "drizzle-orm";

import { db } from "../../database/db";
import {
  verifications,
} from "../../database/verifications.schema";

import {
  emailService,
} from "./email.service";

import {
  phoneService,
} from "./phone.service";

import {
  passwordService,
} from "./password.service";

export class VerificationService {
  /**
   * ----------------------------------------------------------
   * EMAIL VERIFICATION
   * ----------------------------------------------------------
   */

  async createEmailVerification(
    params: {
      userId: string;
      email: string;
      firstName: string;
    },
  ): Promise<void> {
    const code =
      emailService
        .generateVerificationCode();

    const codeHash =
      await passwordService.hash(
        code,
      );

    const expiresAt =
      addMinutes(
        new Date(),
        10,
      );

    await db
      .delete(
        verifications,
      )
      .where(
        and(
          eq(
            verifications.userId,
            params.userId,
          ),

          eq(
            verifications.type,
            "email",
          ),
        ),
      );

    await db
      .insert(
        verifications,
      )
      .values({
        userId:
          params.userId,

        type:
          "email",

        target:
          params.email,

        codeHash,

        providerReference:
          null,

        status:
          "pending",

        expiresAt,
      });

    await emailService
      .sendVerificationCode(
        params.email,
        params.firstName,
        code,
      );
  }

  async verifyEmailCode(
    params: {
      userId: string;
      code: string;
    },
  ): Promise<boolean> {
    const verification =
      await db.query
        .verifications
        .findFirst({
          where:
            and(
              eq(
                verifications.userId,
                params.userId,
              ),

              eq(
                verifications.type,
                "email",
              ),

              eq(
                verifications.status,
                "pending",
              ),

              gt(
                verifications.expiresAt,
                new Date(),
              ),
            ),
        });

    if (!verification) {
      throw new Error(
        "Verification code expired or is no longer valid.",
      );
    }

    if (
      !verification.codeHash
    ) {
      throw new Error(
        "Email verification is not configured correctly.",
      );
    }

    const valid =
      await passwordService.verify(
        params.code.trim(),
        verification.codeHash,
      );

    if (!valid) {
      throw new Error(
        "Invalid verification code.",
      );
    }

    await db
      .update(
        verifications,
      )
      .set({
        status:
          "verified",

        verifiedAt:
          new Date(),
      })
      .where(
        eq(
          verifications.id,
          verification.id,
        ),
      );

    return true;
  }

  /**
   * ----------------------------------------------------------
   * PHONE VERIFICATION
   * ----------------------------------------------------------
   *
   * The verification code belongs to the
   * configured SMS verification provider.
   *
   * PhoneService remains the only service
   * that knows the provider implementation.
   */

  async createPhoneVerification(
    params: {
      userId: string;
      phoneNumber: string;
    },
  ): Promise<void> {
    const expiresAt =
      addMinutes(
        new Date(),
        10,
      );

    await db
      .delete(
        verifications,
      )
      .where(
        and(
          eq(
            verifications.userId,
            params.userId,
          ),

          eq(
            verifications.type,
            "phone",
          ),
        ),
      );

    await phoneService
      .sendVerificationCode(
        params.phoneNumber,
      );

    await db
      .insert(
        verifications,
      )
      .values({
        userId:
          params.userId,

        type:
          "phone",

        target:
          params.phoneNumber,

        codeHash:
          null,

        providerReference:
          null,

        status:
          "pending",

        expiresAt,
      });
  }

  async verifyPhoneCode(
    params: {
      userId: string;
      phoneNumber: string;
      code: string;
    },
  ): Promise<boolean> {
    const verification =
      await db.query
        .verifications
        .findFirst({
          where:
            and(
              eq(
                verifications.userId,
                params.userId,
              ),

              eq(
                verifications.type,
                "phone",
              ),

              eq(
                verifications.status,
                "pending",
              ),

              gt(
                verifications.expiresAt,
                new Date(),
              ),
            ),
        });

    if (!verification) {
      throw new Error(
        "Phone verification expired or is no longer valid.",
      );
    }

    const valid =
      await phoneService
        .verifyCode(
          params.phoneNumber,
          params.code,
        );

    if (!valid) {
      throw new Error(
        "Invalid verification code.",
      );
    }

    await db
      .update(
        verifications,
      )
      .set({
        status:
          "verified",

        verifiedAt:
          new Date(),
      })
      .where(
        eq(
          verifications.id,
          verification.id,
        ),
      );

    return true;
  }
}

export const verificationService =
  new VerificationService();