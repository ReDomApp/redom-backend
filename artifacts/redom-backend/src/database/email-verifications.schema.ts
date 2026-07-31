import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id").notNull(),

    email: varchar("email", { length: 255 })
      .notNull(),

    code: varchar("code", { length: 6 })
      .notNull(),

    purpose: varchar("purpose", { length: 30 })
      .notNull(),

    expiresAt: timestamp("expires_at")
      .notNull(),

    verifiedAt: timestamp("verified_at"),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),
  },
);