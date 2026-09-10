import { index, jsonb, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const registrationFlowMemory = pgTable(
  "registration_flow_memory",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flowId: varchar("flow_id", { length: 16 }).notNull().unique(),
    reservationId: uuid("reservation_id").notNull().unique(),
    completionState: varchar("completion_state", { length: 32 }).notNull().default("phone_verified"),
    registeredTables: jsonb("registered_tables").$type<string[]>().notNull(),
    memory: jsonb("memory").$type<Record<string, unknown>>().notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    flowIdIdx: index("registration_flow_memory_flow_id_idx").on(table.flowId),
    reservationIdIdx: index("registration_flow_memory_reservation_id_idx").on(table.reservationId),
  }),
);
