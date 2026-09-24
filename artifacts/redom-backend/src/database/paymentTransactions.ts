import { bigint, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./schema";
import { verificationSubscriptions } from "./verificationSubscriptions";
import { paymentPlans } from "./paymentPlans";

export const paymentTransactions = pgTable("payment_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  subscriptionId: uuid("subscription_id").references(() => verificationSubscriptions.id),
  planId: uuid("plan_id").references(() => paymentPlans.id),
  reference: varchar("reference", { length: 100 }).notNull().unique(),
  redomTransactionId: varchar("redom_transaction_id", { length: 15 }).unique(),
  externalTransactionId: bigint("external_transaction_id", { mode: "bigint" }),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  purpose: varchar("purpose", { length: 40 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("initialized"),
  checkoutUrl: varchar("checkout_url", { length: 2048 }),
  accessCode: varchar("access_code", { length: 255 }),
  gatewayStatus: varchar("gateway_status", { length: 50 }),
  paidAt: timestamp("paid_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  customerEmailStatus: varchar("customer_email_status", { length: 20 }).notNull().default("pending"),
  customerEmailSentAt: timestamp("customer_email_sent_at"),
  customerEmailError: varchar("customer_email_error", { length: 500 }),
  refundStatus: varchar("refund_status", { length: 30 }),
  refundId: varchar("refund_id", { length: 100 }),
  refundAmountMinor: bigint("refund_amount_minor", { mode: "bigint" }),
  refundRequestedAt: timestamp("refund_requested_at"),
  refundExpectedAt: timestamp("refund_expected_at"),
  refundProcessedAt: timestamp("refund_processed_at"),
  refundError: varchar("refund_error", { length: 500 }),
});