import { pgTable, uuid, varchar, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { userProfiles } from "./userProfiles";

export const groupInviteLinks = pgTable("group_invite_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 128 }).notNull(),
  createdBy: uuid("created_by").notNull().references(() => userProfiles.id),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }),
}, (table) => ({
  tokenUnique: uniqueIndex("group_invite_links_token_unique").on(table.token),
  conversationActiveIdx: index("group_invite_links_conversation_active_idx").on(table.conversationId, table.active),
}));