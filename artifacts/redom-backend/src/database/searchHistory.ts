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

export const searchHistory = pgTable("search_history", {

  // ==================================================
  // INTERNAL ID
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
  // SEARCH
  // ==================================================

  searchQuery: text("search_query")
    .notNull(),

  /**
   * profile
   * post
   * video
   * story
   * group
   * marketplace
   * hashtag
   * page
   * event
   * all
   */
  searchType: varchar("search_type", {
    length: 30,
  })
    .default("all")
    .notNull(),

  // ==================================================
  // RECENT SEARCHES
  // ==================================================

  recentSearch: boolean("recent_search")
    .default(true)
    .notNull(),

  clearedByUser: boolean("cleared_by_user")
    .default(false)
    .notNull(),

  // ==================================================
  // AI SEARCH
  // ==================================================

  aiRanked: boolean("ai_ranked")
    .default(false)
    .notNull(),

  recommendationUsed: boolean(
    "recommendation_used",
  )
    .default(false)
    .notNull(),

  // ==================================================
  // TRENDING
  // ==================================================

  trendingSearch: boolean(
    "trending_search",
  )
    .default(false)
    .notNull(),

  trendingPost: boolean(
    "trending_post",
  )
    .default(false)
    .notNull(),

  trendingLabel: varchar(
    "trending_label",
    {
      length: 255,
    },
  ),

  peopleTalkingCount: integer(
    "people_talking_count",
  )
    .default(0)
    .notNull(),

  // ==================================================
  // ANALYTICS
  // ==================================================

  searchCount: integer("search_count")
    .default(1)
    .notNull(),

  clickedResult: boolean(
    "clicked_result",
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