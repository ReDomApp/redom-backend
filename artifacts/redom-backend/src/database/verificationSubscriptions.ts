import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const verificationSubscriptions = pgTable(
  "verification_subscriptions",
  {
    // Internal Subscription ID
    id: uuid("id").defaultRandom().primaryKey(),

    // Account Owner
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    // -------------------------------
    // SUBSCRIPTION PLAN
    // -------------------------------

    subscriptionType: varchar(
      "subscription_type",
      {
        length: 30,
      }
    ).notNull(),

    // standard
    // standard_plus
    // plus
    // creator
    // business
    // corporate

    subscriptionStatus: varchar(
      "subscription_status",
      {
        length: 20,
      }
    )
      .default("pending")
      .notNull(),

    // pending
    // active
    // expired
    // cancelled
    // suspended

    // -------------------------------
    // BILLING
    // -------------------------------

    billingCycle: varchar("billing_cycle", {
      length: 20,
    })
      .default("monthly")
      .notNull(),

    // monthly

    paymentProvider: varchar(
      "payment_provider",
      {
        length: 30,
      }
    ),

    // google_play
    // google_pay
    // stripe
    // paypal

    paymentReference: varchar(
      "payment_reference",
      {
        length: 255,
      }
    ),

    autoRenew: boolean("auto_renew")
      .default(true)
      .notNull(),

    // -------------------------------
    // DATES
    // -------------------------------

    startedAt: timestamp("started_at"),

    renewedAt: timestamp("renewed_at"),

    expiresAt: timestamp("expires_at"),

    cancelledAt: timestamp(
      "cancelled_at"
    ),

    // -------------------------------
    // MODERATION
    // -------------------------------

    suspendedReason: varchar(
      "suspended_reason",
      {
        length: 1000,
      }
    ),

    // -------------------------------
    // RECORD
    // -------------------------------

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  }
);