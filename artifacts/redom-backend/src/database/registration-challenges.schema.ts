import { sql } from "drizzle-orm";
import { check, index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

/** Server-owned, pre-account registration flow state. */
export const registrationChallenges = pgTable(
  "registration_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flowId: varchar("flow_id", { length: 16 }).notNull(),
    contactType: varchar("contact_type", { length: 10 }).notNull(),
    target: varchar("target", { length: 255 }).notNull(),
    normalizedTarget: varchar("normalized_target", { length: 255 }).notNull(),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    username: varchar("username", { length: 50 }),
    email: varchar("email", { length: 255 }),
    phoneNumber: varchar("phone_number", { length: 20 }),
    dateOfBirth: varchar("date_of_birth", { length: 10 }),
    gender: varchar("gender", { length: 10 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    currentStep: varchar("current_step", { length: 30 }).notNull().default("contact"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    requestIp: varchar("request_ip", { length: 100 }),
    userAgent: varchar("user_agent", { length: 1000 }),
    deviceId: varchar("device_id", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    flowIdFormat: check("registration_challenges_flow_id_format_chk", sql`${table.flowId} ~ '^[0-9]{6,16}$'`),
    flowIdIdx: index("registration_challenges_flow_id_idx").on(table.flowId),
    activeFlowIdIdx: index("registration_challenges_active_flow_id_idx").on(table.flowId, table.status, table.expiresAt),
    targetIdx: index("registration_challenges_target_idx").on(table.normalizedTarget),
    statusIdx: index("registration_challenges_status_idx").on(table.status),
    expiresIdx: index("registration_challenges_expires_idx").on(table.expiresAt),
  }),
);
