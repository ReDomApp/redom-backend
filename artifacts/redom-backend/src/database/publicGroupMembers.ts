import { pgTable, uuid, varchar, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { publicGroups } from "./publicGroups";
import { userProfiles } from "./userProfiles";

export const publicGroupMembers = pgTable("public_group_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id").notNull().references(() => publicGroups.id),
  profileId: uuid("profile_id").notNull().references(() => userProfiles.id),
  role: varchar("role", { length: 20 }).default("member").notNull(),
  active: boolean("active").default(true).notNull(),
  pending: boolean("pending").default(false).notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  groupProfileUnique: uniqueIndex("public_group_members_group_profile_uq").on(table.groupId, table.profileId),
}));