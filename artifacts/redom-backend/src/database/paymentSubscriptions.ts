import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./schema";
import { verificationSubscriptions } from "./verificationSubscriptions";
import { paymentPlans } from "./paymentPlans";

export const paymentSubscriptions = pgTable("payment_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  verificationSubscriptionId: uuid("verification_subscription_id").references(() => verificationSubscriptions.id),
  planId: uuid("plan_id").references(() => paymentPlans.id),
  externalSubscriptionCode: varchar("external_subscription_code", { length: 120 }).notNull().unique(),
  externalCustomerCode: varchar("external_customer_code", { length: 120 }),
  externalEmailToken: varchar("external_email_token", { length: 255 }),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  nextPaymentAt: timestamp("next_payment_at"),
  disabledAt: timestamp("disabled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});