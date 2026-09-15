import { pgTable, uuid, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { messages } from "./messages";
import { userProfiles } from "./userProfiles";

/** Metadata needed to deliver encrypted message-media keys without ever storing plaintext keys. */
export const messageMediaEnvelopes = pgTable("message_media_envelopes", {
  id: uuid("id").defaultRandom().primaryKey(),
  messageId: uuid("message_id").notNull().references(() => messages.id),
  recipientProfileId: uuid("recipient_profile_id").notNull().references(() => userProfiles.id),
  recipientDeviceId: uuid("recipient_device_id"),
  version: integer("version").notNull().default(1),
  algorithm: text("algorithm").notNull().default("X25519-AES-256-GCM"),
  ephemeralPublicKey: text("ephemeral_public_key").notNull(),
  encryptedMediaKey: text("encrypted_media_key").notNull(),
  conversationKeyVersion: integer("conversation_key_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({ recipientDeviceUnique: uniqueIndex("message_media_envelopes_message_device_uq").on(table.messageId, table.recipientDeviceId), recipientMessageUnique: uniqueIndex("message_media_envelopes_message_recipient_uq").on(table.messageId, table.recipientProfileId) }));
