import { pgTable, uuid, varchar, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { reports } from "./reports";
import { messages } from "./messages";
import { userProfiles } from "./userProfiles";

export const reportEvidenceMessages = pgTable(
  "report_evidence_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reportId: uuid("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").notNull().references(() => userProfiles.id),
    messageType: varchar("message_type", { length: 40 }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    moderationText: text("moderation_text"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    reportMessageUnique: uniqueIndex("report_evidence_messages_report_message_unique").on(table.reportId, table.messageId),
  }),
);
