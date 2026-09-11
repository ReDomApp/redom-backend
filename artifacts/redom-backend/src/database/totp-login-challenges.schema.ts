import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const totpLoginChallenges = pgTable("totp_login_challenges", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceId: varchar("device_id", { length: 255 }),
  requestIp: varchar("request_ip", { length: 100 }),
  userAgent: varchar("user_agent", { length: 1000 }),
  attemptCount: varchar("attempt_count", { length: 10 }).default("0").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index("totp_login_challenges_user_idx").on(table.userId),
  expiresIdx: index("totp_login_challenges_expires_idx").on(table.expiresAt),
}));
