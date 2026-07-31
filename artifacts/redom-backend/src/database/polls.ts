import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

import { posts } from "./posts";
import { userProfiles } from "./userProfiles";

export const polls = pgTable("polls", {

  // ==================================================
  // INTERNAL REDOM ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // POST
  // ==================================================

  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id),

  // ==================================================
  // CREATOR
  // ==================================================

  creatorId: uuid("creator_id")
    .notNull()
    .references(() => userProfiles.id),

  // ==================================================
  // QUESTION
  // ==================================================

  question: text("question")
    .notNull(),

  // ==================================================
  // OPTIONS
  // ==================================================

  /**
   * Minimum: 2
   * Maximum: 5
   */

  options: jsonb("options")
    .notNull(),

  /**
   * Vote count
   * for every option.
   */

  optionVoteCounts: jsonb("option_vote_counts")
    .notNull(),

  // ==================================================
  // TOTAL VOTES
  // ==================================================

  totalVotes: integer("total_votes")
    .default(0)
    .notNull(),

  // ==================================================
  // VOTING
  // ==================================================

  /**
   * single
   * multiple
   */

  votingType: varchar("voting_type", {
    length: 20,
  })
    .default("single")
    .notNull(),

  /**
   * Records users who
   * have already voted.
   * Used to prevent
   * duplicate votes.
   */

  votedUsers: jsonb("voted_users")
    .notNull(),

  anonymousVoting: boolean("anonymous_voting")
    .default(false)
    .notNull(),
    /**
 * Vote behavior.
 *
 * First tap:
 * • Cast vote.
 *
 * Second tap on the
 * same option:
 * • Remove vote.
 *
 * User may vote again
 * until the poll is:
 * • Expired
 * • Manually closed
 */
allowVoteRemoval: boolean("allow_vote_removal")
  .default(true)
  .notNull(),

  // ==================================================
  // DURATION
  // ==================================================

  /**
   * 24_hours
   * 2_days
   * 7_days
   * 14_days
   * 30_days
   */

  duration: varchar("duration", {
    length: 20,
  })
    .default("24_hours")
    .notNull(),

  expiresAt: timestamp("expires_at", {
    withTimezone: true,
  }),

  // ==================================================
  // STATUS
  // ==================================================

  manuallyClosed: boolean("manually_closed")
    .default(false)
    .notNull(),

  closed: boolean("closed")
    .default(false)
    .notNull(),

  expired: boolean("expired")
    .default(false)
    .notNull(),

  /**
   * Expired polls remain
   * visible on the post
   * and profile but are
   * no longer recommended
   * in the feed.
   */

  // ==================================================
  // MODERATION
  // ==================================================

  aiReviewed: boolean("ai_reviewed")
    .default(false)
    .notNull(),

  moderationStatus: varchar("moderation_status", {
    length: 30,
  })
    .default("approved")
    .notNull(),

  reported: boolean("reported")
    .default(false)
    .notNull(),

  reportCount: integer("report_count")
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