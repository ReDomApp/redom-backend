import {
  pgTable,
  uuid,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { posts } from "./posts";
import { userProfiles } from "./userProfiles";

export const postMentions = pgTable("post_mentions", {

  // ==================================================
  // INTERNAL ID
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
  // MENTIONED USER
  // ==================================================

  mentionedUserId: uuid("mentioned_user_id")
    .notNull()
    .references(() => userProfiles.id),

  // ==================================================
  // AUTHOR
  // ==================================================

  mentionedByUserId: uuid("mentioned_by_user_id")
    .notNull()
    .references(() => userProfiles.id),

  // ==================================================
  // TAG
  // ==================================================

  /**
   * Indicates the user
   * was tagged in the post.
   */

  tagged: boolean("tagged")
    .default(true)
    .notNull(),

  // ==================================================
  // VALIDATION
  // ==================================================

  /**
   * Invalid usernames
   * are never stored.
   */

  validMention: boolean("valid_mention")
    .default(true)
    .notNull(),

  /**
   * Duplicate mentions
   * are ignored.
   */

  duplicateMention: boolean("duplicate_mention")
    .default(false)
    .notNull(),

  /**
   * A user may only
   * mention someone who
   * is already:
   *
   * • A Friend
   * OR
   * • A Follower
   */

  eligibleMention: boolean("eligible_mention")
    .default(true)
    .notNull(),

  // ==================================================
  // PRIVACY
  // ==================================================

  /**
   * Respects the
   * mentioned user's
   * privacy settings.
   */

  privacyAllowed: boolean("privacy_allowed")
    .default(true)
    .notNull(),

  // ==================================================
  // NOTIFICATION
  // ==================================================

  notificationSent: boolean("notification_sent")
    .default(false)
    .notNull(),

  // ==================================================
  // ANALYTICS
  // ==================================================

  /**
   * Reserved for future
   * "Most Mentioned Users"
   * analytics.
   */

  countedInAnalytics: boolean("counted_in_analytics")
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