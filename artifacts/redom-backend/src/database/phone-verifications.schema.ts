import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

export const phoneVerifications = pgTable(
  "phone_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id").notNull(),

    phoneNumber: varchar("phone_number", {
      length: 20,
    }).notNull(),

    purpose: varchar("purpose", {
      length: 30,
    }).notNull(),

    verificationSid: varchar(
      "verification_sid",
      {
        length: 255,
      },
    ),

    status: varchar("status", {
      length: 20,
    })
      .default("pending")
      .notNull(),

    expiresAt: timestamp("expires_at"),

    verifiedAt: timestamp("verified_at"),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),
  },
);