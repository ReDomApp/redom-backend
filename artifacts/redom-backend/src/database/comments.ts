import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

import { posts } from "./posts";
import { users } from "./schema";

export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentCommentId: uuid("parent_comment_id"),
  replyToUserId: uuid("reply_to_user_id").references(() => users.id, { onDelete: "set null" }),
  publicId: varchar("public_id", { length: 16 }).notNull(),
  shareSlug: varchar("share_slug", { length: 160 }).notNull(),
  content: text("content").notNull(),
  edited: boolean("edited").default(false).notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  hidden: boolean("hidden").default(false).notNull(),
  pinned: boolean("pinned").default(false).notNull(),
  likeCount: integer("like_count").default(0).notNull(),
  replyCount: integer("reply_count").default(0).notNull(),
  reportCount: integer("report_count").default(0).notNull(),
  moderationStatus: varchar("moderation_status", { length: 30 }).default("approved").notNull(),
  spamDetected: boolean("spam_detected").default(false).notNull(),
  aiReviewed: boolean("ai_reviewed").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  publicIdUnique: uniqueIndex("comments_public_id_unique").on(table.publicId),
  postCreatedIndex: index("comments_post_created_idx").on(table.postId, table.createdAt),
  postPinnedIndex: index("comments_post_pinned_idx").on(table.postId, table.pinned, table.createdAt),
  parentIndex: index("comments_parent_idx").on(table.parentCommentId),
}));
