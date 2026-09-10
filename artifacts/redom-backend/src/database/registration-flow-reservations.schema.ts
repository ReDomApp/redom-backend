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
    gender: varchar("gender", { length: 16 }),
    pronouns: varchar("pronouns", { length: 32 }),
    phoneNumber: varchar("phone_number", { length: 32 }),
    phoneCountryCode: varchar("phone_country_code", { length: 2 }),
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
    genderFormat: check(
      "registration_flow_reservations_gender_chk",
      sql`${table.gender} is null or ${table.gender} in ('female', 'male', 'custom')`,
    ),
    pronounsFormat: check(
      "registration_flow_reservations_pronouns_chk",
      sql`${table.pronouns} is null or ${table.pronouns} in ('She / Her', 'He / Him', 'They / Them', 'Prefer not to say')`,
    ),
    phoneCountryFormat: check(
      "registration_flow_reservations_phone_country_chk",
      sql`${table.phoneCountryCode} is null or ${table.phoneCountryCode} ~ '^[A-Z]{2}$'`,
    ),
    expiresIdx: index("registration_flow_reservations_expires_idx").on(table.expiresAt),
  }),
);
