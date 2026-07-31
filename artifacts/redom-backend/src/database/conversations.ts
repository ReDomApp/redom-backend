import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";

export const conversations = pgTable("conversations", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // CREATOR
  // ==================================================

  createdBy: uuid("created_by")
    .notNull()
    .references(() => userProfiles.id),

  // ==================================================
  // CONVERSATION TYPE
  // ==================================================

  /**
   * direct
   * group
   */
  conversationType: varchar("conversation_type", {
    length: 20,
  })
    .default("direct")
    .notNull(),

  // ==================================================
  // GROUP INFORMATION
  // ==================================================

  groupName: varchar("group_name", {
    length: 150,
  }),

  groupDescription: text("group_description"),

  groupPhoto: text("group_photo"),

  groupCoverPhoto: text("group_cover_photo"),

  verified: boolean("verified")
    .default(false)
    .notNull(),

  // ==================================================
  // GROUP SETTINGS
  // ==================================================

  /**
   * Facebook-style defaults.
   */
  anyoneCanEditInfo: boolean("anyone_can_edit_info")
    .default(true)
    .notNull(),

  anyoneCanInvite: boolean("anyone_can_invite")
    .default(true)
    .notNull(),

  anyoneCanRemoveMembers: boolean("anyone_can_remove_members")
    .default(true)
    .notNull(),

  anyoneCanPinMessages: boolean("anyone_can_pin_messages")
    .default(true)
    .notNull(),

  joinApprovalRequired: boolean("join_approval_required")
    .default(false)
    .notNull(),

  anonymousMessagesAllowed: boolean("anonymous_messages_allowed")
    .default(false)
    .notNull(),

  // ==================================================
  // SECURITY
  // ==================================================

  encrypted: boolean("encrypted")
    .default(true)
    .notNull(),

  screenshotDetection: boolean("screenshot_detection")
    .default(true)
    .notNull(),

  // ==================================================
  // MODERATION
  // ==================================================

  aiModerationEnabled: boolean("ai_moderation_enabled")
    .default(true)
    .notNull(),

  moderationStatus: varchar("moderation_status", {
    length: 30,
  })
    .default("approved")
    .notNull(),

  spamDetected: boolean("spam_detected")
    .default(false)
    .notNull(),

  scamDetected: boolean("scam_detected")
    .default(false)
    .notNull(),

  adultContentDetected: boolean("adult_content_detected")
    .default(false)
    .notNull(),

  hateSpeechDetected: boolean("hate_speech_detected")
    .default(false)
    .notNull(),

  malwareDetected: boolean("malware_detected")
    .default(false)
    .notNull(),

  reportCount: integer("report_count")
    .default(0)
    .notNull(),

  // ==================================================
  // COUNTERS
  // ==================================================

  participantCount: integer("participant_count")
    .default(0)
    .notNull(),

  messageCount: integer("message_count")
    .default(0)
    .notNull(),

  onlineMembers: integer("online_members")
    .default(0)
    .notNull(),

  // ==================================================
  // STATUS
  // ==================================================

  /**
   * active
   * frozen
   * suspended
   * deleted
   */
  status: varchar("status", {
    length: 20,
  })
    .default("active")
    .notNull(),

  archived: boolean("archived")
    .default(false)
    .notNull(),

  archivedByCreator: boolean("archived_by_creator")
    .default(false)
    .notNull(),

  locked: boolean("locked")
    .default(false)
    .notNull(),

  deleted: boolean("deleted")
    .default(false)
    .notNull(),

  // ==================================================
  // SYSTEM
  // ==================================================

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  deletedAt: timestamp("deleted_at", {
    withTimezone: true,
  }),

});