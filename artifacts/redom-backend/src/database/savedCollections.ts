import { pgTable, uuid, varchar, boolean, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const savedCollections = pgTable("saved_collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 100 }).notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
  collaborative: boolean("collaborative").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const savedCollectionContributors = pgTable("saved_collection_contributors", {
  collectionId: uuid("collection_id").notNull().references(() => savedCollections.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  invitedByUserId: uuid("invited_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.collectionId, table.userId] }),
}));