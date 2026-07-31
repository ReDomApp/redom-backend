import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    type: varchar("type", {
      length: 20,
    }).notNull(),

    target: varchar("target", {
      length: 255,
    }).notNull(),

    codeHash: varchar("code_hash", {
      length: 255,
    }).notNull(),

    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }).notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index(
      "verifications_user_idx",
    ).on(table.userId),

    typeIdx: index(
      "verifications_type_idx",
    ).on(table.type),

    targetIdx: index(
      "verifications_target_idx",
    ).on(table.target),

    expiresIdx: index(
      "verifications_expires_idx",
    ).on(table.expiresAt),
  }),
);