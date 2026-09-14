import { pgTable, uuid, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { messages } from "./messages";
import { userProfiles } from "./userProfiles";

export const messageDeletions = pgTable("message_deletions", {
  id: uuid("id").defaultRandom().primaryKey(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  messageUserUnique: uniqueIndex("message_deletions_message_user_unique").on(table.messageId, table.userId),
}));
