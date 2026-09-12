import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";

export const reactions = pgTable("reactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  reactorId: uuid("reactor_id").notNull().references(() => userProfiles.id),
  contentType: varchar("content_type", { length: 30 }).notNull(),
  contentId: uuid("content_id").notNull(),
  reactionType: varchar("reaction_type", { length: 20 }).default("like").notNull(),
  active: boolean("active").default(true).notNull(),
  spamDetected: boolean("spam_detected").default(false).notNull(),
  aiReviewed: boolean("ai_reviewed").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  oneReactionPerContent: uniqueIndex("reactions_reactor_content_unique").on(table.reactorId, table.contentType, table.contentId),
}));
