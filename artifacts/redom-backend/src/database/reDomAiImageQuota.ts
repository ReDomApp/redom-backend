import { index, integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const reDomAiImageQuota = pgTable("redom_ai_image_quota", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entitlement: varchar("entitlement", { length: 50 }).notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  windowResetAt: timestamp("window_reset_at", { withTimezone: true }).notNull(),
  limit: integer("limit").notNull(),
  used: integer("used").notNull().default(0),
  reserved: integer("reserved").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userUnique: uniqueIndex("redom_ai_image_quota_user_unique").on(table.userId),
  userReset: index("redom_ai_image_quota_user_reset_idx").on(table.userId, table.windowResetAt),
}));
