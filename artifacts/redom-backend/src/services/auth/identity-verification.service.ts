import {
  and,
  eq,
  gt,
} from "drizzle-orm";

import { db } from "../../database/db";

import {
  verification,
} from "../../database/verification";

import {
  verificationDocuments,
} from "../../database/verificationDocuments";

export interface IdentityVerificationRequirement {
  /**
   * Feature-specific requirement.
   *
   * The backend receives this from the
   * protected feature's business logic.
   */
  documentTypes?: string[];

  /**
   * Optional location requirement.
   *
   * Example:
   * ["US", "CA"]
   *
   * The backend may use this to determine
   * whether an accepted document is valid
   * for the operation.
   */
  countryCode?: string;

  /**
   * Whether the document must have passed
   * face/liveness validation.
   */
  requireFaceMatch?: boolean;

  requireLiveness?: boolean;
}

export class IdentityVerificationService {
  /**
   * ----------------------------------------------------------
   * CURRENT ACCOUNT VERIFICATION STATE
   * ----------------------------------------------------------
   */

  async getStatus(
    userId: string,
  ) {
    const record =
      await db.query
        .verification
        .findFirst({
          where: eq(
            verification.userId,
            userId,
          ),
        });

    if (!record) {
      return {
        status:
          "not_started",

        verified:
          false,
      };
    }

    const verified =
      record.verificationStatus ===
        "approved" &&
      (!record.expiresAt ||
        record.expiresAt >
          new Date());

    return {
      status:
        record.verificationStatus,

      verified,

      badgeVisible:
        record.badgeVisible,

      canReapply:
        record.canReapply,

      expiresAt:
        record.expiresAt,
    };
  }

  /**
   * ----------------------------------------------------------
   * FEATURE GATE
   * ----------------------------------------------------------
   *
   * Use this from a protected backend feature.
   *
   * Example:
   *
   * await identityVerificationService
   *   .requireVerification(
   *     userId,
   *     {
   *       documentTypes:
   *         ["passport", "national_id"],
   *
   *       countryCode:
   *         "US",
   *
   *       requireFaceMatch:
   *         true,
   *
   *       requireLiveness:
   *         true,
   *     },
   *   );
   *
   * The frontend cannot bypass this by claiming
   * that the account is verified.
   */

  async requireVerification(
    userId: string,
    requirement:
      IdentityVerificationRequirement,
  ): Promise<void> {
    const record =
      await db.query
        .verification
        .findFirst({
          where: eq(
            verification.userId,
            userId,
          ),
        });

    if (!record) {
      throw new Error(
        "Identity verification is required for this feature.",
      );
    }

    if (
      record.verificationStatus !==
      "approved"
    ) {
      throw new Error(
        "Identity verification is required for this feature.",
      );
    }

    if (
      record.expiresAt &&
      record.expiresAt <=
        new Date()
    ) {
      throw new Error(
        "Identity verification has expired.",
      );
    }

    const documents =
      await db.query
        .verificationDocuments
        .findMany({
          where: and(
            eq(
              verificationDocuments.userId,
              userId,
            ),

            eq(
              verificationDocuments.verificationResult,
              "approved",
            ),
          ),
        });

    if (
      documents.length === 0
    ) {
      throw new Error(
        "No approved identity document is available.",
      );
    }

    const matchingDocument =
      documents.find(
        (document) => {
          if (
            requirement
              .documentTypes
              ?.length
          ) {
            if (
              !requirement.documentTypes.includes(
                document.documentType,
              )
            ) {
              return false;
            }
          }

          if (
            requirement.countryCode
          ) {
            if (
              document.countryCode !==
              requirement.countryCode
            ) {
              return false;
            }
          }

          if (
            requirement.requireFaceMatch &&
            !document.faceMatched
          ) {
            return false;
          }

          if (
            requirement.requireLiveness &&
            !document.liveCaptureVerified
          ) {
            return false;
          }

          if (
            document.fraudDetected ||
            document.temporarilyBlocked
          ) {
            return false;
          }

          return true;
        },
      );

    if (
      !matchingDocument
    ) {
      throw new Error(
        "The user's identity verification does not satisfy this feature's requirements.",
      );
    }
  }

  /**
   * ----------------------------------------------------------
   * CREATE / REQUEST VERIFICATION
   * ----------------------------------------------------------
   *
   * The caller specifies the document requirement.
   *
   * This does NOT automatically approve anything.
   */

  async requestVerification(
    params: {
      userId: string;

      documentType: string;

      countryCode?: string;
    },
  ) {
    const existing =
      await db.query
        .verification
        .findFirst({
          where: eq(
            verification.userId,
            params.userId,
          ),
        });

    const now =
      new Date();

    if (!existing) {
      const [
        created,
      ] =
        await db
          .insert(
            verification,
          )
          .values({
            userId:
              params.userId,

            verificationStatus:
              "requested",

            requestedAt:
              now,

            applicationAttempts:
              "1",
          })
          .returning();

      if (!created) {
        throw new Error(
          "Unable to create identity verification request.",
        );
      }
    } else {
      await db
        .update(
          verification,
        )
        .set({
          verificationStatus:
            "requested",

          requestedAt:
            now,

          updatedAt:
            now,
        })
        .where(
          eq(
            verification.id,
            existing.id,
          ),
        );
    }

    return this.createDocumentRequest(
      params,
    );
  }

  /**
   * ----------------------------------------------------------
   * DOCUMENT REQUEST
   * ----------------------------------------------------------
   */

  private async createDocumentRequest(
    params: {
      userId: string;

      documentType: string;

      countryCode?: string;
    },
  ) {
    const orderNumber =
      this.generateOrderNumber();

    const [
      document,
    ] =
      await db
        .insert(
          verificationDocuments,
        )
        .values({
          userId:
            params.userId,

          verificationOrderNumber:
            orderNumber,

          documentType:
            params.documentType,

          countryCode:
            params.countryCode,

          verificationResult:
            "pending",
        })
        .returning();

    if (!document) {
      throw new Error(
        "Unable to create identity verification document request.",
      );
    }

    return document;
  }

  /**
   * ----------------------------------------------------------
   * DOCUMENTS
   * ----------------------------------------------------------
   */

  async getDocuments(
    userId: string,
  ) {
    return db.query
      .verificationDocuments
      .findMany({
        where: eq(
          verificationDocuments.userId,
          userId,
        ),
      });
  }

  /**
   * ----------------------------------------------------------
   * ORDER NUMBER
   * ----------------------------------------------------------
   */

  private generateOrderNumber():
    string {
    const timestamp =
      Date.now()
        .toString(36)
        .toUpperCase();

    const random =
      Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase();

    return `RV-${timestamp}-${random}`;
  }
}

export const identityVerificationService =
  new IdentityVerificationService();