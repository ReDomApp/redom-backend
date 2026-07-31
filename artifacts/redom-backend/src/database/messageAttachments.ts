import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { messages } from "./messages";

export const messageAttachments = pgTable(
  "message_attachments",
  {

    // ==================================================
    // INTERNAL ID
    // ==================================================

    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    // ==================================================
    // MESSAGE
    // ==================================================

    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id),

    // ==================================================
    // ATTACHMENT TYPE
    // ==================================================

    /**
     * photo
     * video
     * voice
     * audio
     * document
     * gif
     * sticker
     * location
     * poll
     * shared_post
     * shared_story
     * shared_profile
     * marketplace
     */
    attachmentType: varchar(
      "attachment_type",
      {
        length: 40,
      },
    )
      .notNull(),

    // ==================================================
    // STORAGE
    // ==================================================

    fileUrl: text("file_url"),

    thumbnailUrl: text(
      "thumbnail_url",
    ),

    fileName: varchar("file_name", {
      length: 255,
    }),

    mimeType: varchar("mime_type", {
      length: 120,
    }),

    fileExtension: varchar(
      "file_extension",
      {
        length: 20,
      },
    ),

    fileSize: integer("file_size"),

    width: integer("width"),

    height: integer("height"),

    durationSeconds: integer(
      "duration_seconds",
    ),

    // ==================================================
    // IMAGE
    // ==================================================

    blurNsfw: boolean("blur_nsfw")
      .default(false)
      .notNull(),

    originalResolution: varchar(
      "original_resolution",
      {
        length: 30,
      },
    ),

    compressed: boolean(
      "compressed",
    )
      .default(true)
      .notNull(),

    exifRemoved: boolean(
      "exif_removed",
    )
      .default(true)
      .notNull(),

    // ==================================================
    // VIDEO
    // ==================================================

    thumbnailGenerated: boolean(
      "thumbnail_generated",
    )
      .default(false)
      .notNull(),

    hdAvailable: boolean(
      "hd_available",
    )
      .default(false)
      .notNull(),

    sdAvailable: boolean(
      "sd_available",
    )
      .default(true)
      .notNull(),

    originalQuality: varchar(
      "original_quality",
      {
        length: 30,
      },
    ),

    processingCompleted: boolean(
      "processing_completed",
    )
      .default(false)
      .notNull(),

    // ==================================================
    // VOICE MESSAGE
    // ==================================================

    waveform: text("waveform"),

    playbackSpeed: varchar(
      "playback_speed",
      {
        length: 10,
      },
    )
      .default("1x")
      .notNull(),

    transcription: text(
      "transcription",
    ),

    downloadAllowed: boolean(
      "download_allowed",
    )
      .default(false)
      .notNull(),

    // ==================================================
    // DOCUMENT
    // ==================================================

    filePreview: boolean(
      "file_preview",
    )
      .default(false)
      .notNull(),

    passwordProtected: boolean(
      "password_protected",
    )
      .default(false)
      .notNull(),

    // ==================================================
    // GIF & STICKERS
    // ==================================================

    gifProvider: varchar(
      "gif_provider",
      {
        length: 100,
      },
    ),

    stickerPack: varchar(
      "sticker_pack",
      {
        length: 150,
      },
    ),

    animated: boolean("animated")
      .default(false)
      .notNull(),

    favoriteSticker: boolean(
      "favorite_sticker",
    )
      .default(false)
      .notNull(),

    // ==================================================
    // LOCATION
    // ==================================================

    latitude: text("latitude"),

    longitude: text("longitude"),

    placeName: varchar(
      "place_name",
      {
        length: 255,
      },
    ),

    mapLink: text("map_link"),

    // ==================================================
    // SHARED CONTENT
    // ==================================================

    sharedPostId: uuid(
      "shared_post_id",
    ),

    sharedStoryId: uuid(
      "shared_story_id",
    ),

    sharedProfileId: uuid(
      "shared_profile_id",
    ),

    sharedMarketplaceId: uuid(
      "shared_marketplace_id",
    ),

    // ==================================================
    // MODERATION
    // ==================================================

    aiReviewed: boolean(
      "ai_reviewed",
    )
      .default(false)
      .notNull(),

    spamDetected: boolean(
      "spam_detected",
    )
      .default(false)
      .notNull(),

    malwareDetected: boolean(
      "malware_detected",
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

    copyrightDetected: boolean(
      "copyright_detected",
    )
      .default(false)
      .notNull(),

    // ==================================================
    // STATUS
    // ==================================================

    active: boolean("active")
      .default(true)
      .notNull(),

    deleted: boolean("deleted")
      .default(false)
      .notNull(),

    processing: boolean(
      "processing",
    )
      .default(false)
      .notNull(),

    failed: boolean("failed")
      .default(false)
      .notNull(),

    virusScanned: boolean(
      "virus_scanned",
    )
      .default(false)
      .notNull(),

    // ==================================================
    // SYSTEM
    // ==================================================

    createdAt: timestamp(
      "created_at",
      {
        withTimezone: true,
      },
    )
      .defaultNow()
      .notNull(),

    updatedAt: timestamp(
      "updated_at",
      {
        withTimezone: true,
      },
    )
      .defaultNow()
      .notNull(),

  },
);