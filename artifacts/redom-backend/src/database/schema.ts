import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  date,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),

  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),

  username: varchar("username", { length: 50 }).notNull().unique(),

  email: varchar("email", { length: 255 }).unique(),
  phoneNumber: varchar("phone_number", { length: 20 }).unique(),

  passwordHash: varchar("password_hash", { length: 255 }).notNull(),

  dateOfBirth: date("date_of_birth"),

  gender: varchar("gender", { length: 20 }),

  profileId: varchar("profile_id", { length: 15 })
  .notNull()
  .unique(),

profileIdVisibility: varchar("profile_id_visibility", { length: 10 })
  .default("public")
  .notNull(),
  
  emailVerified: boolean("email_verified").default(false).notNull(),

  phoneVerified: boolean("phone_verified").default(false).notNull(),

  accountStatus: varchar("account_status", { length: 20 })
    .default("active")
    .notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});