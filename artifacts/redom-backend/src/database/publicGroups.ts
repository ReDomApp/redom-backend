import { pgTable, uuid, varchar, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { userProfiles } from "./userProfiles";

export const publicGroups = pgTable("public_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdBy: uuid("created_by").notNull().references(() => userProfiles.id),
  name: varchar("name", { length: 150 }).notNull(),
  description: text("description"),
  groupPhoto: text("group_photo"),
  coverPhoto: text("cover_photo"),
  memberCount: integer("member_count").default(1).notNull(),
  memberApprovalRequired: boolean("member_approval_required").default(false).notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  moderationStatus: varchar("moderation_status", { length: 30 }).default("approved").notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});