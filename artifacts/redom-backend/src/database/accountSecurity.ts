import {
  pgTable,
  uuid,
  boolean,
  varchar,
  timestamp,
  unique,
  check,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import { users } from "./schema";

export const accountSecurity = pgTable(
  "account_security",
  {
    // Internal Security ID
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    // Owner of these security settings
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    // --------------------------------
    // TWO-FACTOR AUTHENTICATION (2FA)
    // --------------------------------

    // Disabled by default
    twoFactorEnabled: boolean("two_factor_enabled")
      .default(false)
      .notNull(),

    // off | authenticator | email | phone
    twoFactorMethod: varchar("two_factor_method", {
      length: 20,
    })
      .default("off")
      .notNull(),

    // --------------------------------
    // SYSTEM
    // --------------------------------

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // One canonical security configuration per account
    userIdUnique: unique(
      "account_security_user_id_unique",
    ).on(table.userId),

    // Only supported 2FA methods are allowed
    twoFactorMethodValid: check(
      "account_security_two_factor_method_valid",
      sql`${table.twoFactorMethod} IN ('off', 'authenticator', 'email', 'phone')`,
    ),

    // Prevent contradictory 2FA states
    twoFactorStateValid: check(
      "account_security_two_factor_state_valid",
      sql`(
        (${table.twoFactorEnabled} = false AND ${table.twoFactorMethod} = 'off')
        OR
        (${table.twoFactorEnabled} = true AND ${table.twoFactorMethod} IN ('authenticator', 'email', 'phone'))
      )`,
    ),
  }),
);