import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { conversations } from "./conversations";
import { userProfiles } from "./userProfiles";

export const messages = pgTable("messages", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // RELATIONSHIPS
  // ==================================================

  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),

  senderId: uuid("sender_id")
    .notNull()
    .references(() => userProfiles.id),

  /**
   * Reply target.
   */
  parentMessageId: uuid("parent_message_id"),

  /**
   * Forwarded message.
   */
  forwardedFromMessageId: uuid(
    "forwarded_from_message_id",
  ),

  // ==================================================
  // MESSAGE TYPE
  // ==================================================

  /**
   * text
   * photo
   * video
   * voice
   * audio
   * document
   * gif
   * sticker
   * emoji
   * contact
   * location
   * poll
   * shared_post
   * shared_story
   * shared_profile
   * marketplace
   * system
   */
  messageType: varchar("message_type", {
    length: 40,
  })
    .default("text")
    .notNull(),

  // ==================================================
  // CONTENT
  // ==================================================

  message: text("message"),

  caption: text("caption"),

  mentions: text("mentions"),

  hashtags: text("hashtags"),

  hyperlink: text("hyperlink"),

  richLinkPreview: boolean(
    "rich_link_preview",
  )
    .default(false)
    .notNull(),

  markdown: boolean("markdown")
    .default(false)
    .notNull(),

  codeBlock: boolean("code_block")
    .default(false)
    .notNull(),

  translated: boolean("translated")
    .default(false)
    .notNull(),

  // ==================================================
  // REACTIONS
  // ==================================================

  likeCount: integer("like_count")
    .default(0)
    .notNull(),

  loveCount: integer("love_count")
    .default(0)
    .notNull(),

  hahaCount: integer("haha_count")
    .default(0)
    .notNull(),

  wowCount: integer("wow_count")
    .default(0)
    .notNull(),

  sadCount: integer("sad_count")
    .default(0)
    .notNull(),

  angryCount: integer("angry_count")
    .default(0)
    .notNull(),

  reactionCount: integer(
    "reaction_count",
  )
    .default(0)
    .notNull(),

  // ==================================================
  // FORWARDING
  // ==================================================

  isForwarded: boolean(
    "is_forwarded",
  )
    .default(false)
    .notNull(),

  // ==================================================
  // EDITING
  // ==================================================

  edited: boolean("edited")
    .default(false)
    .notNull(),

  editedLabel: boolean(
    "edited_label",
  )
    .default(false)
    .notNull(),

  editedAt: timestamp("edited_at", {
    withTimezone: true,
  }),

  // ==================================================
  // PINNING
  // ==================================================

  pinned: boolean("pinned")
    .default(false)
    .notNull(),

  // ==================================================
  // READ STATUS
  // ==================================================

  sent: boolean("sent")
    .default(true)
    .notNull(),

  delivered: boolean("delivered")
    .default(false)
    .notNull(),

  read: boolean("read")
    .default(false)
    .notNull(),

  readAt: timestamp("read_at", {
    withTimezone: true,
  }),

  // ==================================================
  // DELETION
  // ==================================================

  deletedForMe: boolean(
    "deleted_for_me",
  )
    .default(false)
    .notNull(),

  deletedForEveryone: boolean(
    "deleted_for_everyone",
  )
    .default(false)
    .notNull(),

  deletedPlaceholder: boolean(
    "deleted_placeholder",
  )
    .default(false)
    .notNull(),

  deletedAt: timestamp("deleted_at", {
    withTimezone: true,
  }),

  // ==================================================
  // MODERATION
  // ==================================================

  aiReviewed: boolean("ai_reviewed")
    .default(false)
    .notNull(),

  moderationStatus: varchar(
    "moderation_status",
    {
      length: 30,
    },
  )
    .default("approved")
    .notNull(),

  spamDetected: boolean(
    "spam_detected",
  )
    .default(false)
    .notNull(),

  scamDetected: boolean(
    "scam_detected",
  )
    .default(false)
    .notNull(),

  adultContentDetected: boolean(
    "adult_content_detected",
  )
    .default(false)
    .notNull(),

  violenceDetected: boolean(
    "violence_detected",
  )
    .default(false)
    .notNull(),

  hateSpeechDetected: boolean(
    "hate_speech_detected",
  )
    .default(false)
    .notNull(),

  malwareDetected: boolean(
    "malware_detected",
  )
    .default(false)
    .notNull(),

  reportCount: integer(
    "report_count",
  )
    .default(0)
    .notNull(),

  // ==================================================
  // DELIVERY
  // ==================================================

  failedDelivery: boolean(
    "failed_delivery",
  )
    .default(false)
    .notNull(),

  restrictedMessage: boolean(
    "restricted_message",
  )
    .default(false)
    .notNull(),

  // ==================================================
  // CALLS
  // ==================================================

  /**
   * voice_call
   * video_call
   * group_call
   * missed_call
   * declined_call
   */
  callType: varchar("call_type", {
    length: 30,
  }),

  callDurationSeconds: integer(
    "call_duration_seconds",
  ),

  // ==================================================
  // SYSTEM
  // ==================================================

  /**
   * user_joined
   * user_left
   * user_removed
   * conversation_renamed
   * group_photo_changed
   * group_cover_changed
   * encryption_enabled
   * call_started
   * call_ended
   */
  systemAction: varchar(
    "system_action",
    {
      length: 60,
    },
  ),

  // ==================================================
  // TIMESTAMPS
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

});