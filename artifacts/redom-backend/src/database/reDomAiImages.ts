import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const reDomAiImages = pgTable("redom_ai_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: varchar("job_id", { length: 80 }).notNull(),
  operation: varchar("operation", { length: 30 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  modelId: varchar("model_id", { length: 255 }),
  prompt: text("prompt").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  steps: integer("steps").notNull(),
  seed: text("seed"),
  storageKey: varchar("storage_key", { length: 600 }),
  status: varchar("status", { length: 24 }).notNull().default("completed"),
  generationMs: integer("generation_ms"),
  error: varchar("error", { length: 1000 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  jobUnique: uniqueIndex("redom_ai_images_job_id_unique").on(table.jobId),
  userCreated: index("redom_ai_images_user_created_idx").on(table.userId, table.createdAt),
}));
