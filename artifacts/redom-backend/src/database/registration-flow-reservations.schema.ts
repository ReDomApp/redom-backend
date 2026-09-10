import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const registrationFlowReservations = pgTable(
  "registration_flow_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flowId: varchar("flow_id", { length: 16 }).notNull().unique(),
    deviceId: varchar("device_id", { length: 255 }),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    dateOfBirth: varchar("date_of_birth", { length: 10 }),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    flowIdFormat: check(
      "registration_flow_reservations_flow_id_format_chk",
      sql`${table.flowId} ~ '^[0-9]{6,16}$'`,
    ),
    statusFormat: check(
      "registration_flow_reservations_status_chk",
      sql`${table.status} in ('active', 'completed', 'blocked')`,
    ),
    expiresIdx: index("registration_flow_reservations_expires_idx").on(table.expiresAt),
  }),
);
