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
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    flowIdFormat: check(
      "registration_flow_reservations_flow_id_format_chk",
      sql`${table.flowId} ~ '^[0-9]{6,16}$'`,
    ),
    expiresIdx: index("registration_flow_reservations_expires_idx").on(table.expiresAt),
  }),
);
