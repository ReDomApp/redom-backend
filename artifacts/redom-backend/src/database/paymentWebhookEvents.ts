import { jsonb, pgTable, timestamp, uuid, varchar, boolean } from "drizzle-orm/pg-core";

export const paymentWebhookEvents = pgTable("payment_webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventKey: varchar("event_key", { length: 255 }).notNull().unique(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  reference: varchar("reference", { length: 100 }),
  payload: jsonb("payload").notNull(),
  processed: boolean("processed").notNull().default(false),
  processingError: varchar("processing_error", { length: 4000 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});