import {
  and,
  eq,
} from "drizzle-orm";

import { db } from "../../database/db";

import {
  verificationSubscriptions,
} from "../../database/verificationSubscriptions";

export class VerificationSubscriptionService {
  async getActiveSubscription(
    userId: string,
  ) {
    return db.query
      .verificationSubscriptions
      .findFirst({
        where: and(
          eq(
            verificationSubscriptions.userId,
            userId,
          ),

          eq(
            verificationSubscriptions.subscriptionStatus,
            "active",
          ),
        ),
      });
  }

  async createPendingSubscription(
    params: {
      userId: string;

      subscriptionType:
        | "standard"
        | "standard_plus"
        | "plus"
        | "creator"
        | "business"
        | "corporate";

      paymentProvider?: string;
      paymentReference?: string;
    },
  ) {
    const [
      subscription,
    ] =
      await db
        .insert(
          verificationSubscriptions,
        )
        .values({
          userId:
            params.userId,

          subscriptionType:
            params.subscriptionType,

          subscriptionStatus:
            "pending",

          billingCycle:
            "monthly",

          paymentProvider:
            params.paymentProvider,

          paymentReference:
            params.paymentReference,

          autoRenew:
            true,
        })
        .returning();

    if (!subscription) {
      throw new Error(
        "Unable to create verification subscription.",
      );
    }

    return subscription;
  }

  async cancel(
    userId: string,
    subscriptionId: string,
  ) {
    const existing =
      await db.query
        .verificationSubscriptions
        .findFirst({
          where: and(
            eq(
              verificationSubscriptions.id,
              subscriptionId,
            ),

            eq(
              verificationSubscriptions.userId,
              userId,
            ),
          ),
        });

    if (!existing) {
      throw new Error(
        "Verification subscription not found.",
      );
    }

    const [
      updated,
    ] =
      await db
        .update(
          verificationSubscriptions,
        )
        .set({
          subscriptionStatus:
            "cancelled",

          autoRenew:
            false,

          cancelledAt:
            new Date(),

          updatedAt:
            new Date(),
        })
        .where(
          eq(
            verificationSubscriptions.id,
            subscriptionId,
          ),
        )
        .returning();

    return updated;
  }
}

export const verificationSubscriptionService =
  new VerificationSubscriptionService();