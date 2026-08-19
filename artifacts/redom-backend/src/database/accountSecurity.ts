import {
  pgTable,
  uuid,
  boolean,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const accountSecurity = pgTable("account_security", {
  // Internal Security ID
  id: uuid("id").defaultRandom().primaryKey(),

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
});