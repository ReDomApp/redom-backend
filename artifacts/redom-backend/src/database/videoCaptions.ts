import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { postMedia } from "./postMedia";

export const videoCaptions = pgTable("video_captions", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // PARENT VIDEO
  // ==================================================

  mediaId: uuid("media_id")
    .notNull()
    .references(() => postMedia.id),

  // ==================================================
  // CAPTION TYPE
  // ==================================================

  /**
   * automatic
   * manual
   * closed_caption
   * subtitle
   */

  captionType: varchar("caption_type", {
    length: 30,
  })
    .default("automatic")
    .notNull(),

  // ==================================================
  // LANGUAGE
  // ==================================================

  language: varchar("language", {
    length: 50,
  })
    .notNull(),

  originalLanguage: varchar("original_language", {
    length: 50,
  }),

  translatedLanguage: varchar("translated_language", {
    length: 50,
  }),

  // ==================================================
  // TRANSLATION
  // ==================================================

  /**
   * ai
   * manual
   * uploaded
   */

  translationSource: varchar("translation_source", {
    length: 30,
  }),

  // ==================================================
  // ACCESSIBILITY
  // ==================================================

  closedCaptions: boolean("closed_captions")
    .default(true)
    .notNull(),

  hearingAccessible: boolean("hearing_accessible")
    .default(false)
    .notNull(),

  speakerIdentification: boolean("speaker_identification")
    .default(false)
    .notNull(),

  soundDescriptions: boolean("sound_descriptions")
    .default(false)
    .notNull(),

  // ==================================================
  // CAPTION SEGMENT
  // ==================================================

  startTimeMs: integer("start_time_ms")
    .notNull(),

  endTimeMs: integer("end_time_ms")
    .notNull(),

  captionText: text("caption_text")
    .notNull(),

  // ==================================================
  // AI
  // ==================================================

  aiGenerated: boolean("ai_generated")
    .default(true)
    .notNull(),

  confidenceScore: integer("confidence_score"),

  multipleSpeakersDetected: boolean("multiple_speakers_detected")
    .default(false)
    .notNull(),

  reviewRequired: boolean("review_required")
    .default(false)
    .notNull(),

  // ==================================================
  // FILES
  // ==================================================

  /**
   * Cloudflare R2 object key
   * Example:
   * captions/en/video123.vtt
   */

  subtitleObjectKey: varchar("subtitle_object_key", {
    length: 500,
  }),

  /**
   * srt
   * vtt
   * ass
   */

  subtitleFormat: varchar("subtitle_format", {
    length: 20,
  }),

  // ==================================================
  // MODERATION
  // ==================================================

  moderationStatus: varchar("moderation_status", {
    length: 20,
  })
    .default("pending")
    .notNull(),

  moderationReason: varchar("moderation_reason", {
    length: 255,
  }),

  // ==================================================
  // STATUS
  // ==================================================

  enabled: boolean("enabled")
    .default(true)
    .notNull(),

  defaultCaption: boolean("default_caption")
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
});