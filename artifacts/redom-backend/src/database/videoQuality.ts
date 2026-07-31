import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { postMedia } from "./postMedia";

export const videoQuality = pgTable("video_quality", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // Parent Video

  mediaId: uuid("media_id")
    .notNull()
    .references(() => postMedia.id),

  // ==================================================
  // ORIGINAL VIDEO
  // ==================================================

  originalResolution: varchar("original_resolution", {
    length: 20,
  }).notNull(),

  originalCodec: varchar("original_codec", {
    length: 20,
  }).notNull(),

  originalBitrate: integer("original_bitrate"),

  originalFps: integer("original_fps"),

  // ==================================================
  // GENERATED QUALITIES
  // ==================================================

  /**
   * Available after processing.
   */

  quality144p: boolean("quality_144p")
    .default(false)
    .notNull(),

  quality240p: boolean("quality_240p")
    .default(false)
    .notNull(),

  quality360p: boolean("quality_360p")
    .default(false)
    .notNull(),

  quality480p: boolean("quality_480p")
    .default(false)
    .notNull(),

  quality720p: boolean("quality_720p")
    .default(false)
    .notNull(),

  quality1080p: boolean("quality_1080p")
    .default(false)
    .notNull(),

  quality1440p: boolean("quality_1440p")
    .default(false)
    .notNull(),

  quality2160p: boolean("quality_2160p")
    .default(false)
    .notNull(),

  /**
   * Default playback quality.
   */

  defaultQuality: varchar("default_quality", {
    length: 10,
  })
    .default("720p")
    .notNull(),

  /**
   * Backend never upscales.
   */

  upscaleAllowed: boolean("upscale_allowed")
    .default(false)
    .notNull(),

  // ==================================================
  // NETWORK ADAPTATION
  // ==================================================

  /**
   * Backend automatically uploads
   * and serves the most suitable
   * quality according to network
   * conditions and source quality.
   */

  adaptiveStreaming: boolean("adaptive_streaming")
    .default(true)
    .notNull(),

  networkAdaptivePlayback: boolean("network_adaptive_playback")
    .default(true)
    .notNull(),

  // ==================================================
  // STREAMING
  // ==================================================

  progressivePlayback: boolean("progressive_playback")
    .default(true)
    .notNull(),

  fastStartPlayback: boolean("fast_start_playback")
    .default(true)
    .notNull(),

  chunkedStreaming: boolean("chunked_streaming")
    .default(true)
    .notNull(),

  // ==================================================
  // CODECS
  // ==================================================

  h264: boolean("h264")
    .default(true)
    .notNull(),

  h265: boolean("h265")
    .default(true)
    .notNull(),

  av1: boolean("av1")
    .default(false)
    .notNull(),

  vp9: boolean("vp9")
    .default(false)
    .notNull(),

  // ==================================================
  // FRAME RATE
  // ==================================================

  fps24: boolean("fps24")
    .default(false)
    .notNull(),

  fps25: boolean("fps25")
    .default(false)
    .notNull(),

  fps30: boolean("fps30")
    .default(true)
    .notNull(),

  fps50: boolean("fps50")
    .default(false)
    .notNull(),

  fps60: boolean("fps60")
    .default(false)
    .notNull(),

  // ==================================================
  // HDR
  // ==================================================

  sdr: boolean("sdr")
    .default(true)
    .notNull(),

  hdr10: boolean("hdr10")
    .default(false)
    .notNull(),

  hdr10Plus: boolean("hdr10_plus")
    .default(false)
    .notNull(),

  dolbyVision: boolean("dolby_vision")
    .default(false)
    .notNull(),

  // ==================================================
  // COMPRESSION
  // ==================================================

  compressed: boolean("compressed")
    .default(false)
    .notNull(),

  optimizedForStreaming: boolean("optimized_for_streaming")
    .default(true)
    .notNull(),

  // ==================================================
  // THUMBNAILS
  // ==================================================

  mainThumbnailKey: varchar("main_thumbnail_key", {
    length: 500,
  }),

  previewThumbnailKey: varchar("preview_thumbnail_key", {
    length: 500,
  }),

  animatedPreviewKey: varchar("animated_preview_key", {
    length: 500,
  }),

  // ==================================================
  // PROCESSING
  // ==================================================

  /**
   * waiting
   * processing
   * ready
   * failed
   */

  processingStatus: varchar("processing_status", {
    length: 20,
  })
    .default("waiting")
    .notNull(),

  // ==================================================
  // CLOUD STORAGE
  // ==================================================

  originalObjectKey: varchar("original_object_key", {
    length: 500,
  }),

  object144p: varchar("object_144p", {
    length: 500,
  }),

  object240p: varchar("object_240p", {
    length: 500,
  }),

  object360p: varchar("object_360p", {
    length: 500,
  }),

  object480p: varchar("object_480p", {
    length: 500,
  }),

  object720p: varchar("object_720p", {
    length: 500,
  }),

  object1080p: varchar("object_1080p", {
    length: 500,
  }),

  object1440p: varchar("object_1440p", {
    length: 500,
  }),

  object2160p: varchar("object_2160p", {
    length: 500,
  }),

  // ==================================================
  // PLAYBACK
  // ==================================================

  automaticQualitySelection: boolean("automatic_quality_selection")
    .default(true)
    .notNull(),

  manualQualitySelection: boolean("manual_quality_selection")
    .default(true)
    .notNull(),

  resumePlayback: boolean("resume_playback")
    .default(true)
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