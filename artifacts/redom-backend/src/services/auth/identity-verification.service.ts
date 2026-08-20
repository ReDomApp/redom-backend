import {
  and,
  eq,
} from "drizzle-orm";

import { db } from "../../database/db";

import {
  verification,
} from "../../database/verification";

import {
  verificationDocuments,
} from "../../database/verificationDocuments";

export class IdentityVerificationService {
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
        exists: false,
        status:
          "not_invited",
      };
    }

    return {
      exists: true,
      status:
        record.verificationStatus,
      type:
        record.verificationType,
      badgeVisible:
        record.badgeVisible,
      canReapply:
        record.canReapply,
      expiresAt:
        record.expiresAt,
    };
  }

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

  async createApplication(
    params: {
      userId: string;
      verificationType:
        | "individual"
        | "business"
        | "government"
        | "corporate";
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

    if (existing) {
      throw new Error(
        "A verification application already exists for this account.",
      );
    }

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

          verificationType:
            params.verificationType,

          verificationStatus:
            "pending",

          applicationSubmittedAt:
            new Date(),
        })
        .returning();

    if (!created) {
      throw new Error(
        "Unable to create verification application.",
      );
    }

    return created;
  }

  async addDocument(
    params: {
      userId: string;
      verificationOrderNumber: string;
      documentType: string;

      frontCapture?: string;
      backCapture?: string;
      selfieCapture?: string;
      livenessCapture?: string;
    },
  ) {
    const application =
      await db.query
        .verification
        .findFirst({
          where: and(
            eq(
              verification.userId,
              params.userId,
            ),

            eq(
              verification.verificationStatus,
              "pending",
            ),
          ),
        });

    if (!application) {
      throw new Error(
        "No pending identity verification application exists.",
      );
    }

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
            params.verificationOrderNumber,

          documentType:
            params.documentType,

          frontCapture:
            params.frontCapture,

          backCapture:
            params.backCapture,

          selfieCapture:
            params.selfieCapture,

          livenessCapture:
            params.livenessCapture,
        })
        .returning();

    if (!document) {
      throw new Error(
        "Unable to create verification document.",
      );
    }

    return document;
  }
}

export const identityVerificationService =
  new IdentityVerificationService();