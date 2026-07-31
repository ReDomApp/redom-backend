import {
  pgTable,
  uuid,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";

export const feedPreferences = pgTable("feed_preferences", {

  // ==================================================
  // INTERNAL REDOM ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // USER
  // ==================================================

  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id),

  // ==================================================
  // FEEDS
  // ==================================================

  /**
   * Home Feed
   *
   * All supported
   * content appears
   * here.
   */
  homeFeedEnabled: boolean("home_feed_enabled")
    .default(true)
    .notNull(),

  /**
   * Combined
   * Following &
   * Friends feed.
   */
  followingFeedEnabled: boolean("following_feed_enabled")
    .default(true)
    .notNull(),

  /**
   * Videos/Reels feed.
   */
  videosFeedEnabled: boolean("videos_feed_enabled")
    .default(true)
    .notNull(),

  // ==================================================
  // INTERNAL
  // RECOMMENDATION SIGNALS
  // ==================================================

  likedContentScore: integer("liked_content_score")
    .default(0)
    .notNull(),

  commentedContentScore: integer("commented_content_score")
    .default(0)
    .notNull(),

  sharedContentScore: integer("shared_content_score")
    .default(0)
    .notNull(),

  savedContentScore: integer("saved_content_score")
    .default(0)
    .notNull(),

  watchedVideoScore: integer("watched_video_score")
    .default(0)
    .notNull(),

  watchTimeScore: integer("watch_time_score")
    .default(0)
    .notNull(),

  pollParticipationScore: integer("poll_participation_score")
    .default(0)
    .notNull(),

  // ==================================================
  // CONTENT FILTERS
  // ==================================================

  sensitiveContentEnabled: boolean("sensitive_content_enabled")
    .default(true)
    .notNull(),

  languagePreferenceEnabled: boolean("language_preference_enabled")
    .default(true)
    .notNull(),

  // ==================================================
  // RANKING
  // ==================================================

  friendsPriority: integer("friends_priority")
    .default(100)
    .notNull(),

  followingPriority: integer("following_priority")
    .default(100)
    .notNull(),

  trendingPriority: integer("trending_priority")
    .default(100)
    .notNull(),

  newestPriority: integer("newest_priority")
    .default(100)
    .notNull(),

  // ==================================================
  // RECOMMENDATION STATUS
  // ==================================================

  recommendationEligible: boolean("recommendation_eligible")
    .default(true)
    .notNull(),

  recommendationRestricted: boolean("recommendation_restricted")
    .default(false)
    .notNull(),

  personalizedRecommendationsEnabled: boolean(
    "personalized_recommendations_enabled"
  )
    .default(true)
    .notNull(),

  /**
   * Home button refreshes
   * the feed.
   */
  feedRefreshRequested: boolean("feed_refresh_requested")
    .default(false)
    .notNull(),

  /**
   * Infinite scrolling.
   */
  infiniteFeedEnabled: boolean("infinite_feed_enabled")
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