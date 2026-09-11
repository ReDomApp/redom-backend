import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export type RegistrationFlowNetworkSecurityMemory = {
  ip?: string | null;
  connection?: string | null;
  country?: string | null;
  countryCode?: string | null;
  region?: string | null;
  city?: string | null;
  timezone?: string | null;
  organization?: string | null;
  companyType?: string | null;
  asn?: number | null;
  datacenter?: string | null;
  datacenterDomain?: string | null;
  datacenterNetwork?: string | null;
  vpnService?: string | null;
  egressService?: string | null;
  egressProvider?: string | null;
  proxy?: boolean;
  vpn?: boolean;
  tor?: boolean;
  bot?: boolean;
  abuser?: boolean;
  mobile?: boolean;
  satellite?: boolean;
  bogon?: boolean;
  fraudScore?: number;
  fraudLevel?: "low" | "moderate" | "high" | "critical";
  companyAbuserScore?: number;
  asnAbuserScore?: number;
  securitySignals?: string[];
  consented?: boolean;
  consentedAt?: string | null;
  dataPurpose?: string;
  dataSource?: string;
  ipapi?: Record<string, unknown>;
};

export type RegistrationFlowEmailMemory = {
  address: string;
  domain: string;
  provider: "google" | "microsoft" | "yahoo";
  verificationStatus: "not_started" | string;
  savedAt: string;
};

export type RegistrationFlowPasswordMemory = {
  hash: string;
  strength: "weak" | "medium" | "strong";
  rememberLoginInfo: boolean;
  savedAt: string;
};

export type RegistrationFlowMemory = {
  flow: { flowId: string; reservationId: string; status: string; expiresAt: string };
  screens: Record<string, { completed: boolean; completedAt: string }>;
  identity: { firstName: string | null; lastName: string | null };
  birthday: { dateOfBirth: string | null };
  gender: { gender: string | null; pronouns: string | null };
  phoneLookup: {
    phoneNumber: string | null;
    lookupStatus: string | null;
    valid: boolean | null;
    active: boolean | null;
    voip: boolean | null;
    fraudScore: number | null;
    lineType: string | null;
    carrier: string | null;
    lookupRequestId: string | null;
  };
  networkSecurity: RegistrationFlowNetworkSecurityMemory & {
    ipFraudScore: number | null;
    botStatus: boolean | null;
  };
  email?: RegistrationFlowEmailMemory;
  password?: RegistrationFlowPasswordMemory;
};

export const registrationFlowReservations = pgTable("registration_flow_reservations", {
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
  phoneLookupStatus: varchar("phone_lookup_status", { length: 32 }),
  phoneValid: boolean("phone_valid"),
  phoneActive: boolean("phone_active"),
  phoneVoip: boolean("phone_voip"),
  phoneFraudScore: integer("phone_fraud_score"),
  phoneLineType: varchar("phone_line_type", { length: 64 }),
  phoneCarrier: varchar("phone_carrier", { length: 255 }),
  phoneLookupCountryCode: varchar("phone_lookup_country_code", { length: 2 }),
  phoneLookupRequestId: varchar("phone_lookup_request_id", { length: 128 }),
  phoneLookupAt: timestamp("phone_lookup_at", { withTimezone: true }),
  ipFraudScore: integer("ip_fraud_score"),
  ipProxy: boolean("ip_proxy"),
  ipVpn: boolean("ip_vpn"),
  ipTor: boolean("ip_tor"),
  ipBotStatus: boolean("ip_bot_status"),
  ipCountryCode: varchar("ip_country_code", { length: 2 }),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  registeredTables: jsonb("registered_tables").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  memory: jsonb("memory").$type<RegistrationFlowMemory>().notNull().default(sql`'{}'::jsonb`),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  flowIdFormat: check("registration_flow_reservations_flow_id_format_chk", sql`${table.flowId} ~ '^[0-9]{6,16}$'`),
  statusFormat: check("registration_flow_reservations_status_chk", sql`${table.status} in ('active', 'completed', 'blocked')`),
  genderFormat: check("registration_flow_reservations_gender_chk", sql`${table.gender} is null or ${table.gender} in ('female', 'male', 'custom')`),
  pronounsFormat: check("registration_flow_reservations_pronouns_chk", sql`${table.pronouns} is null or ${table.pronouns} in ('She / Her', 'He / Him', 'They / Them', 'Prefer not to say')`),
  phoneCountryFormat: check("registration_flow_reservations_phone_country_chk", sql`${table.phoneCountryCode} is null or ${table.phoneCountryCode} ~ '^[A-Z]{2}$'`),
  phoneLookupCountryFormat: check("registration_flow_reservations_phone_lookup_country_chk", sql`${table.phoneLookupCountryCode} is null or ${table.phoneLookupCountryCode} ~ '^[A-Z]{2}$'`),
  ipCountryFormat: check("registration_flow_reservations_ip_country_chk", sql`${table.ipCountryCode} is null or ${table.ipCountryCode} ~ '^[A-Z]{2}$'`),
  expiresIdx: index("registration_flow_reservations_expires_idx").on(table.expiresAt),
}));
