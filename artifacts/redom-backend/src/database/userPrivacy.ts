import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const userPrivacy = pgTable("user_privacy", {
  // Internal Privacy ID
  id: uuid("id").defaultRandom().primaryKey(),

  // User that owns these privacy settings
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // ----------------------------
  // PROFILE
  // ----------------------------

  // public | friends | private
  profileVisibility: varchar("profile_visibility", {
    length: 20,
  })
    .default("public")
    .notNull(),

  // ----------------------------
  // FRIEND REQUESTS
  // ----------------------------

  // public | friends_of_friends | no_one
  friendRequests: varchar("friend_requests", {
    length: 30,
  })
    .default("public")
    .notNull(),

  // ----------------------------
  // FOLLOW REQUESTS
  // ----------------------------

  // public | approval_required
  //
  // Public accounts:
  // Anyone follows instantly.
  //
  // Private accounts:
  // Every follow requires approval.
  followRequests: varchar("follow_requests", {
    length: 30,
  })
    .default("public")
    .notNull(),

  // ----------------------------
  // MESSAGES
  // ----------------------------

  // message_requests | friends | no_one |
  // all_friends_except_selected |
  // only_selected_friends
  messages: varchar("messages", {
    length: 40,
  })
    .default("message_requests")
    .notNull(),

  // ----------------------------
  // COMMENTS
  // ----------------------------

  // friends | friends_of_friends | no_one |
  // followers | public
  comments: varchar("comments", {
    length: 30,
  })
    .default("friends")
    .notNull(),

  // ----------------------------
  // MENTIONS
  // ----------------------------

  // friends | followers | public | no_one
  mentions: varchar("mentions", {
    length: 30,
  })
    .default("friends")
    .notNull(),

  // ----------------------------
  // TAGS
  // ----------------------------

  // friends | followers | public | no_one
  tags: varchar("tags", {
    length: 30,
  })
    .default("friends")
    .notNull(),

  // ----------------------------
  // FRIENDS LIST
  // ----------------------------

  // friends | public | no_one
  friendsListVisibility: varchar("friends_list_visibility", {
    length: 20,
  })
    .default("friends")
    .notNull(),

  // ----------------------------
  // FOLLOWERS LIST
  // ----------------------------

  // friends | public | no_one
  followersVisibility: varchar("followers_visibility", {
    length: 20,
  })
    .default("friends")
    .notNull(),

  // ----------------------------
  // FOLLOWING LIST
  // ----------------------------

  // friends | public | no_one
  followingVisibility: varchar("following_visibility", {
    length: 20,
  })
    .default("friends")
    .notNull(),

  // ----------------------------
  // REDOM ID
  // ----------------------------

  // true = public
  // false = private
  redomIdPublic: boolean("redom_id_public")
    .default(true)
    .notNull(),

  // ----------------------------
  // ACCOUNT DISCOVERABILITY
  // ----------------------------

  // Controls whether this account
  // can appear in:
  //
  // • Search
  // • Suggested People
  // • Recommendations
  discoverable: boolean("discoverable")
    .default(true)
    .notNull(),

  // ----------------------------
  // SEARCH ENGINE INDEXING
  // ----------------------------

  // Allow public profile to appear
  // in external search engines.
  searchEngineIndexing: boolean("search_engine_indexing")
    .default(true)
    .notNull(),

  // ----------------------------
  // SYSTEM
  // ----------------------------

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull(),
});