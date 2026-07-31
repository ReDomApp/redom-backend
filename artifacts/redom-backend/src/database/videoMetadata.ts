import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
} from "drizzle-orm/pg-core";

import { postMedia } from "./postMedia";

export const videoMetadata = pgTable("video_metadata", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // Parent Media

  mediaId: uuid("media_id")
    .notNull()
    .references(() => postMedia.id),

  // ==================================================
  // BASIC INFORMATION
  // ==================================================

  videoTitle: varchar("video_title", {
    length: 255,
  }),

  description: text("description"),

  category: varchar("category", {
    length: 100,
  }),

  language: varchar("language", {
    length: 50,
  }),

  originalLanguage: varchar("original_language", {
    length: 50,
  }),

  /**
   * Tags, hashtags and mentions
   * are stored in their own tables.
   */

  // ==================================================
  // USER PUBLISHING
  // ==================================================

  /**
   * draft
   * published
   * scheduled
   * premiere
   */

  publishingStatus: varchar("publishing_status", {
    length: 20,
  })
    .default("draft")
    .notNull(),

  scheduledPublishAt: timestamp("scheduled_publish_at", {
    withTimezone: true,
  }),

  premiereEnabled: boolean("premiere_enabled")
    .default(false)
    .notNull(),

  premiereStartsAt: timestamp("premiere_starts_at", {
    withTimezone: true,
  }),

  publishedAt: timestamp("published_at", {
    withTimezone: true,
  }),

  /**
   * Videos never expire automatically.
   *
   * Users may:
   * • Delete
   * • Archive
   * • Change audience
   */

  // ==================================================
  // AUDIENCE
  // ==================================================

  /**
   * public
   * friends
   * followers
   * custom
   * only_me
   */

  audience: varchar("audience", {
    length: 20,
  })
    .default("public")
    .notNull(),

  // ==================================================
  // VIEWING
  // ==================================================

  embeddingEnabled: boolean("embedding_enabled")
    .default(true)
    .notNull(),

  sharingEnabled: boolean("sharing_enabled")
    .default(true)
    .notNull(),

  /**
   * ReDom videos cannot
   * be downloaded.
   */

  downloadable: boolean("downloadable")
    .default(false)
    .notNull(),

  clippingEnabled: boolean("clipping_enabled")
    .default(true)
    .notNull(),

  remixEnabled: boolean("remix_enabled")
    .default(true)
    .notNull(),

  duetEnabled: boolean("duet_enabled")
    .default(true)
    .notNull(),

  // ==================================================
  // ACCESSIBILITY
  // ==================================================

  closedCaptionsEnabled: boolean("closed_captions_enabled")
    .default(false)
    .notNull(),

  automaticCaptionsEnabled: boolean("automatic_captions_enabled")
    .default(true)
    .notNull(),

  subtitleLanguage: varchar("subtitle_language", {
    length: 50,
  }),

  multipleSubtitles: boolean("multiple_subtitles")
    .default(false)
    .notNull(),

  altDescription: text("alt_description"),

  // ==================================================
  // SAFETY
  // ==================================================

  /**
   * SYSTEM CONTROLLED
   */

  sensitiveContentWarning: boolean("sensitive_content_warning")
    .default(false)
    .notNull(),

  graphicContentWarning: boolean("graphic_content_warning")
    .default(false)
    .notNull(),

  aiGeneratedLabel: boolean("ai_generated_label")
    .default(false)
    .notNull(),

  /**
   * USER CONTROLLED
   */

  ageRestriction: varchar("age_restriction", {
    length: 20,
  })
    .default("all")
    .notNull(),

  sponsoredContent: boolean("sponsored_content")
    .default(false)
    .notNull(),

  // ==================================================
  // MONETIZATION
  // ==================================================

  monetizationEnabled: boolean("monetization_enabled")
    .default(false)
    .notNull(),

  monetizationEligible: boolean("monetization_eligible")
    .default(false)
    .notNull(),

  // ==================================================
  // COPYRIGHT
  // ==================================================

  /**
   * SYSTEM CONTROLLED
   */

  copyrightStatus: varchar("copyright_status", {
    length: 30,
  })
    .default("pending")
    .notNull(),

  copyrightOwner: varchar("copyright_owner", {
    length: 255,
  }),

  copyrightDispute: boolean("copyright_dispute")
    .default(false)
    .notNull(),

  audioOwnership: varchar("audio_ownership", {
    length: 100,
  }),

  manualClaim: boolean("manual_claim")
    .default(false)
    .notNull(),

  automaticClaim: boolean("automatic_claim")
    .default(false)
    .notNull(),

  // ==================================================
  // AI
  // ==================================================

  aiModerationCompleted: boolean("ai_moderation_completed")
    .default(false)
    .notNull(),

  aiConfidenceScore: integer("ai_confidence_score"),

  humanReviewRequired: boolean("human_review_required")
    .default(false)
    .notNull(),

  humanReviewCompleted: boolean("human_review_completed")
    .default(false)
    .notNull(),

  // ==================================================
  // RECOMMENDATION
  // ==================================================

  eligibleForRecommendations: boolean("eligible_for_recommendations")
    .default(true)
    .notNull(),

  eligibleForTrending: boolean("eligible_for_trending")
    .default(true)
    .notNull(),

  eligibleForExplore: boolean("eligible_for_explore")
    .default(true)
    .notNull(),

  eligibleForFollowingFeed: boolean("eligible_for_following_feed")
    .default(true)
    .notNull(),

  eligibleForFriendsFeed: boolean("eligible_for_friends_feed")
    .default(true)
    .notNull(),

  // ==================================================
  // CACHE
  // ==================================================

  viewsCount: bigint("views_count", {
    mode: "number",
  })
    .default(0)
    .notNull(),

  likesCount: bigint("likes_count", {
    mode: "number",
  })
    .default(0)
    .notNull(),

  commentsCount: bigint("comments_count", {
    mode: "number",
  })
    .default(0)
    .notNull(),

  sharesCount: bigint("shares_count", {
    mode: "number",
  })
    .default(0)
    .notNull(),

  savesCount: bigint("saves_count", {
    mode: "number",
  })
    .default(0)
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