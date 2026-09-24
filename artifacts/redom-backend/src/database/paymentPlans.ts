import { boolean, bigint, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const paymentPlans = pgTable("payment_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  planKey: varchar("plan_key", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  interval: varchar("interval", { length: 20 }).notNull().default("monthly"),
  externalPlanCode: varchar("external_plan_code", { length: 100 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});