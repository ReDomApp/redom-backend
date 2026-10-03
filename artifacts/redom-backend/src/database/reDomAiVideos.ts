import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const reDomAiVideos = pgTable("redom_ai_videos", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: varchar("job_id", { length: 80 }).notNull(),
  runtime: varchar("runtime", { length: 64 }).notNull().default("redom-v2.8-native"),
  model: varchar("model", { length: 120 }).notNull().default("ReDom-v2.8—Video"),
  operation: varchar("operation", { length: 32 }).notNull().default("generate"),
  prompt: text("prompt").notNull(),
  targetDurationSeconds: integer("target_duration_seconds").notNull(),
  resolution: varchar("resolution", { length: 16 }).notNull(),
  aspectRatio: varchar("aspect_ratio", { length: 16 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("queued"),
  storageKey: varchar("storage_key", { length: 600 }),
  downloadTokenHash: varchar("download_token_hash", { length: 64 }),
  downloadTokenExpiresAt: timestamp("download_token_expires_at", { withTimezone: true }),
  generationMs: integer("generation_ms"),
  error: varchar("error", { length: 1000 }),
  securityRequestId: varchar("security_request_id", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  jobUnique: uniqueIndex("redom_ai_videos_job_id_unique").on(table.jobId),
  userCreated: index("redom_ai_videos_user_created_idx").on(table.userId, table.createdAt),
}));
