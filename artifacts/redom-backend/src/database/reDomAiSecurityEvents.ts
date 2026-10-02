import { index, integer, jsonb, pgTable, timestamp, uuid, varchar, text } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const reDomAiSecurityEvents = pgTable("redom_ai_security_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestId: varchar("request_id", { length: 80 }).notNull(),
  operation: varchar("operation", { length: 40 }).notNull(),
  policyCode: varchar("policy_code", { length: 80 }).notNull(),
  riskLevel: varchar("risk_level", { length: 20 }).notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  documentClass: varchar("document_class", { length: 60 }),
  providerSignals: jsonb("provider_signals"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userCreated: index("redom_ai_security_events_user_created_idx").on(table.userId, table.createdAt),
  requestIdx: index("redom_ai_security_events_request_idx").on(table.requestId),
  policyIdx: index("redom_ai_security_events_policy_idx").on(table.policyCode, table.createdAt),
}));
