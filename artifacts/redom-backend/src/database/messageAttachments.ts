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
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id").notNull().references(() => messages.id),
    attachmentType: varchar("attachment_type", { length: 40 }).notNull(),

    fileUrl: text("file_url"),
    thumbnailUrl: text("thumbnail_url"),
    fileName: varchar("file_name", { length: 255 }),
    mimeType: varchar("mime_type", { length: 120 }),
    fileExtension: varchar("file_extension", { length: 20 }),
    fileSize: integer("file_size"),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: integer("duration_seconds"),

    blurNsfw: boolean("blur_nsfw").default(false).notNull(),
    originalResolution: varchar("original_resolution", { length: 30 }),
    compressed: boolean("compressed").default(true).notNull(),
    exifRemoved: boolean("exif_removed").default(true).notNull(),

    thumbnailGenerated: boolean("thumbnail_generated").default(false).notNull(),
    hdAvailable: boolean("hd_available").default(false).notNull(),
    sdAvailable: boolean("sd_available").default(true).notNull(),
    originalQuality: varchar("original_quality", { length: 30 }),
    processingCompleted: boolean("processing_completed").default(false).notNull(),

    waveform: text("waveform"),
    playbackSpeed: varchar("playback_speed", { length: 10 }).default("1x").notNull(),
    transcription: text("transcription"),
    downloadAllowed: boolean("download_allowed").default(false).notNull(),

    filePreview: boolean("file_preview").default(false).notNull(),
    passwordProtected: boolean("password_protected").default(false).notNull(),

    gifProvider: varchar("gif_provider", { length: 100 }),
    stickerPack: varchar("sticker_pack", { length: 150 }),
    animated: boolean("animated").default(false).notNull(),
    favoriteSticker: boolean("favorite_sticker").default(false).notNull(),

    latitude: text("latitude"),
    longitude: text("longitude"),
    placeName: varchar("place_name", { length: 255 }),
    mapLink: text("map_link"),

    sharedPostId: uuid("shared_post_id"),
    sharedStoryId: uuid("shared_story_id"),
    sharedProfileId: uuid("shared_profile_id"),
    sharedMarketplaceId: uuid("shared_marketplace_id"),

    aiReviewed: boolean("ai_reviewed").default(false).notNull(),
    spamDetected: boolean("spam_detected").default(false).notNull(),
    malwareDetected: boolean("malware_detected").default(false).notNull(),
    adultContentDetected: boolean("adult_content_detected").default(false).notNull(),
    violenceDetected: boolean("violence_detected").default(false).notNull(),
    copyrightDetected: boolean("copyright_detected").default(false).notNull(),

    active: boolean("active").default(true).notNull(),
    deleted: boolean("deleted").default(false).notNull(),
    processing: boolean("processing").default(false).notNull(),
    failed: boolean("failed").default(false).notNull(),
    virusScanned: boolean("virus_scanned").default(false).notNull(),

    // Encrypted message media and View Once lifecycle.
    encrypted: boolean("encrypted").default(false).notNull(),
    encryptionVersion: integer("encryption_version"),
    viewOnce: boolean("view_once").default(false).notNull(),
    viewOnceOpened: boolean("view_once_opened").default(false).notNull(),
    viewOnceOpenedAt: timestamp("view_once_opened_at", { withTimezone: true }),
    viewOnceExpiresAt: timestamp("view_once_expires_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
);
