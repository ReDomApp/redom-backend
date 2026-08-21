import {
  and,
  eq,
  gt,
  inArray,
} from "drizzle-orm";

import {
  db,
} from "../../database/db";

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
  verificationPolicyService,
  type VerificationPurpose,
} from "./verification-policy";

import {
  generateOtp,
  getOtpExpiration,
  hashOtp,
  validateOtpLength,
  verifyOtpHash,
  type OtpChannel,
  type OtpLength,
} from "../../utils/otp";

type CreateVerificationParams = {
  userId?: string | null;

  purpose: VerificationPurpose;

  target: string;

  channel: OtpChannel;

  requestedLength?: number;

  firstName?: string;

  requestIp?: string;

  userAgent?: string;

  deviceId?: string;

  sessionId?: string;
};

type VerifyVerificationParams = {
  challengeId: string;

  code: string;

  /**
   * Optional defensive purpose check.
   *
   * If supplied, it MUST match the challenge.
   */
  purpose?: VerificationPurpose;
};

type VerificationResult = {
  success: true;

  challengeId: string;

  purpose: string;

  type: string;

  target: string;

  channel: OtpChannel;

  status: "verified";

  userId:
    | string
    | null;
};

type DeliveryResult = {
  provider: string;

  providerReference?: string;
};

export class VerificationService {
  /**
   * ----------------------------------------------------------
   * CREATE CHALLENGE
   * ----------------------------------------------------------
   */
  async createVerification(
    params: CreateVerificationParams,
  ) {
    const purpose =
      params.purpose;

    /**
     * Validate channel against backend policy.
     */
    verificationPolicyService
      .validateChannel(
        purpose,
        params.channel,
      );

    /**
     * Validate/normalize target.
     */
    const normalizedTarget =
      this.normalizeTarget(
        params.channel,
        params.target,
      );

    /**
     * Determine OTP length.
     */
    const requestedLength =
      params.requestedLength ??
      verificationPolicyService
        .getDefaultLength(
          purpose,
        );

    const codeLength =
      validateOtpLength(
        requestedLength,
      );

    verificationPolicyService
      .validateLength(
        purpose,
        codeLength,
      );

    /**
     * Generate cryptographically secure OTP.
     */
    const code =
      generateOtp(
        codeLength,
      );

    /**
     * Hash immediately.
     *
     * Plaintext must never be written to
     * the database.
     */
    const codeHash =
      hashOtp(code);

    const now =
      new Date();

    const expiresAt =
      getOtpExpiration(
        params.channel,
        now,
      );

    const maxAttempts =
      verificationPolicyService
        .getMaxAttempts();

    const type =
      verificationPolicyService
        .getType(
          purpose,
        );

    /**
     * Invalidate previous active challenges for
     * this exact security context.
     *
     * We deliberately do not delete historical
     * verification records.
     */
    await db
      .update(
        verifications,
      )
      .set({
        status:
          "invalidated",

        updatedAt:
          now,
      })
      .where(
        and(
          params.userId
            ? eq(
                verifications.userId,
                params.userId,
              )
            : eq(
                verifications
                  .normalizedTarget,
                normalizedTarget,
              ),

          eq(
            verifications.purpose,
            purpose,
          ),

          eq(
            verifications
              .normalizedTarget,
            normalizedTarget,
          ),

          inArray(
            verifications.status,
            [
              "pending",
            ],
          ),
        ),
      );

    /**
     * Create challenge first.
     *
     * This gives the frontend a challenge ID even
     * when there is no userId.
     */
    const [
      verification,
    ] = await db
      .insert(
        verifications,
      )
      .values({
        userId:
          params.userId ??
          null,

        type,

        purpose,

        target:
          params.target,

        normalizedTarget,

        channel:
          params.channel,

        requestedLength:
          String(
            codeLength,
          ),

        codeLength:
          String(
            codeLength,
          ),

        codeHash,

        status:
          "pending",

        attemptCount:
          "0",

        maxAttempts:
          String(
            maxAttempts,
          ),

        requestIp:
          params.requestIp,

        userAgent:
          params.userAgent,

        deviceId:
          params.deviceId,

        sessionId:
          params.sessionId
            ?? null,

        expiresAt,

        createdAt:
          now,

        updatedAt:
          now,
      })
      .returning();

    if (!verification) {
      throw new Error(
        "Unable to create verification challenge.",
      );
    }

    /**
     * Deliver the plaintext OTP.
     *
     * The plaintext remains outside the database.
     */
    try {
      const delivery =
        await this.deliverOtp({
          channel:
            params.channel,

          target:
            normalizedTarget,

          code,

          purpose,

          expiresAt,

          firstName:
            params.firstName,
        });

      await db
        .update(
          verifications,
        )
        .set({
          provider:
            delivery.provider,

          providerReference:
            delivery.providerReference,

          updatedAt:
            new Date(),
        })
        .where(
          eq(
            verifications.id,
            verification.id,
          ),
        );
    } catch (error) {
      await db
        .update(
          verifications,
        )
        .set({
          status:
            "delivery_failed",

          updatedAt:
            new Date(),
        })
        .where(
          eq(
            verifications.id,
            verification.id,
          ),
        );

      throw error;
    }

    return {
      success: true,

      challengeId:
        verification.id,

      purpose,

      type,

      target:
        params.target,

      normalizedTarget,

      channel:
        params.channel,

      codeLength,

      expiresAt,

      status:
        "pending" as const,
    };
  }

  /**
   * ----------------------------------------------------------
   * VERIFY CHALLENGE
   * ----------------------------------------------------------
   */
  async verifyVerification(
    params: VerifyVerificationParams,
  ): Promise<VerificationResult> {
    const verification =
      await db.query
        .verifications
        .findFirst({
          where:
            eq(
              verifications.id,
              params.challengeId,
            ),
        });

    if (!verification) {
      throw new Error(
        "Verification challenge not found.",
      );
    }

    /**
     * Defensive purpose binding.
     */
    if (
      params.purpose &&
      verification.purpose !==
        params.purpose
    ) {
      throw new Error(
        "Verification purpose does not match the challenge.",
      );
    }

    /**
     * Only pending challenges may be verified.
     */
    if (
      verification.status !==
      "pending"
    ) {
      throw new Error(
        "Verification challenge is no longer valid.",
      );
    }

    const now =
      new Date();

    /**
     * Expiration enforcement.
     */
    if (
      verification.expiresAt
        .getTime() <=
      now.getTime()
    ) {
      await db
        .update(
          verifications,
        )
        .set({
          status:
            "expired",

          updatedAt:
            now,
        })
        .where(
          eq(
            verifications.id,
            verification.id,
          ),
        );

      throw new Error(
        "Verification code has expired.",
      );
    }

    const attemptCount =
      Number(
        verification.attemptCount,
      );

    const maxAttempts =
      Number(
        verification.maxAttempts,
      );

    if (
      attemptCount >=
      maxAttempts
    ) {
      await db
        .update(
          verifications,
        )
        .set({
          status:
            "failed",

          updatedAt:
            now,
        })
        .where(
          eq(
            verifications.id,
            verification.id,
          ),
        );

      throw new Error(
        "Maximum verification attempts exceeded.",
      );
    }

    const submittedCode =
      params.code.trim();

    /**
     * Reject malformed codes before hashing.
     */
    if (
      !new RegExp(
        `^\\d{${Number(
          verification.codeLength,
        )}}$`,
      ).test(
        submittedCode,
      )
    ) {
      await this.registerFailedAttempt(
        verification.id,
        attemptCount,
        maxAttempts,
      );

      throw new Error(
        "Invalid verification code.",
      );
    }

    const valid =
      verifyOtpHash(
        submittedCode,
        verification.codeHash,
      );

    if (!valid) {
      await this.registerFailedAttempt(
        verification.id,
        attemptCount,
        maxAttempts,
      );

      throw new Error(
        "Invalid verification code.",
      );
    }

    /**
     * Mark verification successful.
     *
     * It becomes consumed in the same operation.
     */
    const verifiedAt =
      new Date();

    await db
      .update(
        verifications,
      )
      .set({
        status:
          "consumed",

        verifiedAt,

        consumedAt:
          verifiedAt,

        updatedAt:
          verifiedAt,
      })
      .where(
        and(
          eq(
            verifications.id,
            verification.id,
          ),

          eq(
            verifications.status,
            "pending",
          ),
        ),
      );

    return {
      success: true,

      challengeId:
        verification.id,

      purpose:
        verification.purpose,

      type:
        verification.type,

      target:
        verification.target,

      channel:
        verification.channel as OtpChannel,

      status:
        "verified",

      userId:
        verification.userId,
    };
  }

  /**
   * ----------------------------------------------------------
   * RESEND
   * ----------------------------------------------------------
   *
   * Resend always creates a NEW OTP.
   *
   * The old challenge is invalidated.
   */
  async resendVerification(
    params: {
      challengeId: string;

      channel?: OtpChannel;

      requestedLength?: number;

      firstName?: string;

      requestIp?: string;

      userAgent?: string;

      deviceId?: string;

      sessionId?: string;
    },
  ) {
    const oldChallenge =
      await db.query
        .verifications
        .findFirst({
          where:
            eq(
              verifications.id,
              params.challengeId,
            ),
        });

    if (!oldChallenge) {
      throw new Error(
        "Verification challenge not found.",
      );
    }

    if (
      oldChallenge.status !==
      "pending"
    ) {
      throw new Error(
        "This verification challenge can no longer be resent.",
      );
    }

    const channel =
      params.channel ??
      (oldChallenge.channel as OtpChannel);

    const length =
      params.requestedLength ??
      Number(
        oldChallenge.codeLength,
      );

    await db
      .update(
        verifications,
      )
      .set({
        status:
          "invalidated",

        updatedAt:
          new Date(),
      })
      .where(
        eq(
          verifications.id,
          oldChallenge.id,
        ),
      );

    return this.createVerification({
      userId:
        oldChallenge.userId,

      purpose:
        oldChallenge.purpose as VerificationPurpose,

      target:
        oldChallenge.target,

      channel,

      requestedLength:
        length,

      firstName:
        params.firstName,

      requestIp:
        params.requestIp,

      userAgent:
        params.userAgent,

      deviceId:
        params.deviceId,

      sessionId:
        params.sessionId ??
        oldChallenge.sessionId ??
        undefined,
    });
  }

  /**
   * ----------------------------------------------------------
   * COMPATIBILITY METHODS
   * ----------------------------------------------------------
   *
   * These retain the existing AuthService call shapes
   * while moving the actual OTP authority here.
   */

  async createEmailVerification(
    params: {
      userId?: string;
      email: string;
      firstName: string;
      requestedLength?: number;
      requestIp?: string;
      userAgent?: string;
      deviceId?: string;
      sessionId?: string;
    },
  ) {
    return this.createVerification({
      userId:
        params.userId,

      purpose:
        "EMAIL_VERIFICATION",

      target:
        params.email,

      channel:
        "email",

      requestedLength:
        params.requestedLength,

      firstName:
        params.firstName,

      requestIp:
        params.requestIp,

      userAgent:
        params.userAgent,

      deviceId:
        params.deviceId,

      sessionId:
        params.sessionId,
    });
  }

  async createPhoneVerification(
    params: {
      userId?: string;
      phoneNumber: string;
      requestedLength?: number;
      channel?:
        | "sms"
        | "whatsapp";
      requestIp?: string;
      userAgent?: string;
      deviceId?: string;
      sessionId?: string;
    },
  ) {
    return this.createVerification({
      userId:
        params.userId,

      purpose:
        "PHONE_VERIFICATION",

      target:
        params.phoneNumber,

      channel:
        params.channel ??
        "sms",

      requestedLength:
        params.requestedLength,

      requestIp:
        params.requestIp,

      userAgent:
        params.userAgent,

      deviceId:
        params.deviceId,

      sessionId:
        params.sessionId,
    });
  }

  async verifyEmailCode(
    params: {
      challengeId?: string;
      userId?: string;
      code: string;
    },
  ) {
    if (
      !params.challengeId
    ) {
      if (
        !params.userId
      ) {
        throw new Error(
          "challengeId or userId is required.",
        );
      }

      const challenge =
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
                  verifications.purpose,
                  "EMAIL_VERIFICATION",
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

      if (!challenge) {
        throw new Error(
          "Email verification challenge not found.",
        );
      }

      return this.verifyVerification({
        challengeId:
          challenge.id,

        code:
          params.code,

        purpose:
          "EMAIL_VERIFICATION",
      });
    }

    return this.verifyVerification({
      challengeId:
        params.challengeId,

      code:
        params.code,

      purpose:
        "EMAIL_VERIFICATION",
    });
  }

  async verifyPhoneCode(
    params: {
      challengeId?: string;
      userId?: string;
      phoneNumber?: string;
      code: string;
    },
  ) {
    if (
      params.challengeId
    ) {
      return this.verifyVerification({
        challengeId:
          params.challengeId,

        code:
          params.code,

        purpose:
          "PHONE_VERIFICATION",
      });
    }

    if (
      !params.userId
    ) {
      throw new Error(
        "challengeId or userId is required.",
      );
    }

    const challenge =
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
                verifications.purpose,
                "PHONE_VERIFICATION",
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

    if (!challenge) {
      throw new Error(
        "Phone verification challenge not found.",
      );
    }

    /**
     * The stored challenge target is authoritative.
     *
     * We do not allow the caller to substitute
     * another phone number.
     */
    if (
      params.phoneNumber
    ) {
      const supplied =
        phoneService.validate(
          params.phoneNumber,
        );

      if (
        supplied !==
        challenge.normalizedTarget
      ) {
        throw new Error(
          "The phone number does not match the verification challenge.",
        );
      }
    }

    return this.verifyVerification({
      challengeId:
        challenge.id,

      code:
        params.code,

      purpose:
        "PHONE_VERIFICATION",
    });
  }

  /**
   * ----------------------------------------------------------
   * INTERNAL DELIVERY
   * ----------------------------------------------------------
   */
  private async deliverOtp(
    params: {
      channel: OtpChannel;

      target: string;

      code: string;

      purpose: VerificationPurpose;

      expiresAt: Date;

      firstName?: string;
    },
  ): Promise<DeliveryResult> {
    if (
      params.channel ===
      "email"
    ) {
      return emailService.sendOtp({
        email:
          params.target,

        firstName:
          params.firstName,

        code:
          params.code,

        purpose:
          params.purpose,

        expiresAt:
          params.expiresAt,
      });
    }

    const result =
      await phoneService.sendOtp({
        phoneNumber:
          params.target,

        code:
          params.code,

        channel:
          params.channel,

        purpose:
          params.purpose,

        expiresAt:
          params.expiresAt,
      });

    return {
      provider:
        result.provider,

      providerReference:
        result.providerReference,
    };
  }

  /**
   * ----------------------------------------------------------
   * TARGET NORMALIZATION
   * ----------------------------------------------------------
   */
  private normalizeTarget(
    channel: OtpChannel,
    target: string,
  ): string {
    if (
      channel ===
      "email"
    ) {
      return emailService
        .validate(
          target,
        );
    }

    return phoneService
      .validate(
        target,
      );
  }

  /**
   * 
       ----------------------------------------------------------
   * FAILED ATTEMPT
   * ----------------------------------------------------------
   */
  private async registerFailedAttempt(
    verificationId: string,
    currentAttempts: number,
    maxAttempts: number,
  ): Promise<void> {
    const nextAttempts =
      currentAttempts + 1;

    const status =
      nextAttempts >=
      maxAttempts
        ? "failed"
        : "pending";

    await db
      .update(
        verifications,
      )
      .set({
        attemptCount:
          String(
            nextAttempts,
          ),

        status,

        updatedAt:
          new Date(),
      })
      .where(
        and(
          eq(
            verifications.id,
            verificationId,
          ),

          eq(
            verifications.status,
            "pending",
          ),
        ),
      );
  }
}

export const verificationService =
  new VerificationService();