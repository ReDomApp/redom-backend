import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  check,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import { accountSecurity } from "./accountSecurity";

export const twoFactorRecoveryCodes = pgTable(
  "two_factor_recovery_codes",
  {
    // Internal Recovery Code Record ID
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    // Security configuration that owns this recovery code
    accountSecurityId: uuid("account_security_id")
      .notNull()
      .references(() => accountSecurity.id, {
        onDelete: "cascade",
      }),

    // Secure hash of the recovery code.
    // The plaintext recovery code must never be stored.
    codeHash: varchar("code_hash", {
      length: 255,
    }).notNull(),

    // Original plaintext code length.
    // Must remain within the approved 6–15 character range.
    codeLength: integer("code_length")
      .notNull(),

    // Set when the recovery code is successfully consumed.
    usedAt: timestamp("used_at"),

    // Set when the recovery code is explicitly invalidated.
    revokedAt: timestamp("revoked_at"),

    // Record creation time
    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Recovery codes must be between 6 and 15 characters.
    codeLengthValid: check(
      "two_factor_recovery_codes_length_valid",
      sql`${table.codeLength} >= 6 AND ${table.codeLength} <= 15`,
    ),
  }),
);