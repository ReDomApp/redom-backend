import {
  pgTable,
  uuid,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { stories } from "./stories";
import { userProfiles } from "./userProfiles";

export const storyViewers = pgTable("story_viewers", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // STORY
  // ==================================================

  storyId: uuid("story_id")
    .notNull()
    .references(() => stories.id),

  // ==================================================
  // VIEWER
  // ==================================================

  viewerId: uuid("viewer_id")
    .notNull()
    .references(() => userProfiles.id),

  // ==================================================
  // VIEW STATUS
  // ==================================================

  /**
   * Prevent duplicate
   * story views.
   *
   * One viewer
   * counts once.
   */
  viewed: boolean("viewed")
    .default(true)
    .notNull(),

  /**
   * True when the
   * viewer is a friend
   * of the creator.
   */
  isFriend: boolean("is_friend")
    .default(false)
    .notNull(),

  /**
   * True when the
   * viewer follows the
   * creator.
   */
  isFollower: boolean("is_follower")
    .default(false)
    .notNull(),

  /**
   * Professional Mode:
   * Friend/Follower
   * can be identified.
   *
   * Other public viewers
   * increase total views
   * but remain anonymous.
   */
  visibleToCreator: boolean("visible_to_creator")
    .default(true)
    .notNull(),

  // ==================================================
  // SYSTEM
  // ==================================================

  viewedAt: timestamp("viewed_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

});