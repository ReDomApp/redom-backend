import {
  pgTable,
  uuid,
  boolean,
  varchar,
  timestamp,
  unique,
  check,
  text,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema";

export const accountSecurity = pgTable(
  "account_security",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),

    twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
    twoFactorMethod: varchar("two_factor_method", { length: 20 }).default("off").notNull(),

    // RFC-compatible TOTP configuration. The live secret is encrypted with AES-256-GCM.
    totpEnabled: boolean("totp_enabled").default(false).notNull(),
    totpSecretEncrypted: text("totp_secret_encrypted"),
    totpAlgorithm: varchar("totp_algorithm", { length: 10 }).default("SHA1"),
    totpDigits: varchar("totp_digits", { length: 2 }).default("6"),
    totpPeriod: varchar("totp_period", { length: 4 }).default("30"),
    totpConfirmedAt: timestamp("totp_confirmed_at", { withTimezone: true }),
    totpLastUsedStep: varchar("totp_last_used_step", { length: 20 }),

    // Temporary setup secret is encrypted and deleted immediately after confirmation/expiry.
    totpSetupSecretEncrypted: text("totp_setup_secret_encrypted"),
    totpSetupExpiresAt: timestamp("totp_setup_expires_at", { withTimezone: true }),

    // Recovery codes are SHA-256 hashes in JSON; plaintext codes are returned only once at generation.
    recoveryCodesHashes: text("recovery_codes_hashes"),
    recoveryCodesGeneratedAt: timestamp("recovery_codes_generated_at", { withTimezone: true }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdUnique: unique("account_security_user_id_unique").on(table.userId),
    twoFactorMethodValid: check("account_security_two_factor_method_valid", sql`${table.twoFactorMethod} IN ('off', 'authenticator', 'email', 'phone')`),
    twoFactorStateValid: check("account_security_two_factor_state_valid", sql`(
      (${table.twoFactorEnabled} = false AND ${table.twoFactorMethod} = 'off')
      OR
      (${table.twoFactorEnabled} = true AND ${table.twoFactorMethod} IN ('authenticator', 'email', 'phone'))
    )`),
    totpStateValid: check("account_security_totp_state_valid", sql`(
      (${table.totpEnabled} = false AND ${table.twoFactorMethod} <> 'authenticator')
      OR
      (${table.totpEnabled} = true AND ${table.twoFactorEnabled} = true AND ${table.twoFactorMethod} = 'authenticator' AND ${table.totpSecretEncrypted} IS NOT NULL)
    )`),
  }),
);
