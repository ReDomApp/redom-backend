import {
  pgTable,
  uuid,
 varchar,
 integer,
 bigint,
 boolean,
 timestamp,
} from "drizzle-orm/pg-core";

import { posts } from "./posts";

export const postMedia = pgTable("post_media", {

  // ==========================================
  // INTERNAL ID
  // ==========================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // Parent Post

  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id),

  // ==========================================
  // PUBLIC SHARE ID
  // ==========================================

  /**
   * Randomly generated.
   *
   * Can be:
   *
   * 3849201746
   * AKPXMZQWER
   * 48QAZ91XPT
   */

  shareId: varchar("share_id", {
    length: 10,
  })
    .unique()
    .notNull(),

  // ==========================================
  // MEDIA
  // ==========================================

  /**
   * image
   * video
   * gif
   * audio
   * document
   */

  mediaType: varchar("media_type", {
    length: 20,
  }).notNull(),

  // ==========================================
  // CLOUD STORAGE
  // ==========================================

  /**
   * Cloudflare R2 object key.
   *
   * Example:
   *
   * media/videos/2026/08/AB39X9Q.mp4
   */

  objectKey: varchar("object_key", {
    length: 500,
  }).notNull(),

  /**
   * Thumbnail object key.
   */

  thumbnailKey: varchar("thumbnail_key", {
    length: 500,
  }),

  fileName: varchar("file_name", {
    length: 255,
  }),

  mimeType: varchar("mime_type", {
    length: 100,
  }).notNull(),

  fileSize: bigint("file_size", {
    mode: "number",
  }).notNull(),

  width: integer("width"),

  height: integer("height"),

  /**
   * Seconds.
   *
   * Maximum:
   *
   * 600
   */

  duration: integer("duration"),

  // ==========================================
  // ACCESSIBILITY
  // ==========================================

  caption: varchar("caption", {
    length: 1000,
  }),

  altText: varchar("alt_text", {
    length: 500,
  }),

  // ==========================================
  // ORDER
  // ==========================================

  displayOrder: integer("display_order")
    .default(1)
    .notNull(),

  isPrimary: boolean("is_primary")
    .default(false)
    .notNull(),

  // ==========================================
  // PROCESSING
  // ==========================================

  /**
   * uploading
   * scanning
   * processing
   * ready
   * upload_failed
   */

  processingStatus: varchar("processing_status", {
    length: 25,
  })
    .default("uploading")
    .notNull(),

  // ==========================================
  // MODERATION
  // ==========================================

  /**
   * pending
   * approved
   * rejected
   */

  moderationStatus: varchar("moderation_status", {
    length: 20,
  })
    .default("pending")
    .notNull(),

  /**
   * sexual_content
   * graphic_violence
   * terrorism
   * copyright
   * malware
   * spam
   * other
   */

  moderationReason: varchar("moderation_reason", {
    length: 100,
  }),

  reviewRequested: boolean("review_requested")
    .default(false)
    .notNull(),

  // ==========================================
  // SYSTEM
  // ==========================================

  uploadedAt: timestamp("uploaded_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

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