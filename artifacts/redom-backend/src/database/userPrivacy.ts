import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const userPrivacy =
  pgTable(
    "user_privacy",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),

      userId: uuid("user_id")
        .notNull()
        .references(
          () => users.id,
          {
            onDelete:
              "cascade",
          },
        ),

      // --------------------------------
      // PROFILE
      // --------------------------------

      profileVisibility:
        varchar(
          "profile_visibility",
          {
            length: 20,
          },
        )
          .default("public")
          .notNull(),

      // --------------------------------
      // FRIEND REQUESTS
      // --------------------------------

      friendRequests:
        varchar(
          "friend_requests",
          {
            length: 30,
          },
        )
          .default("public")
          .notNull(),

      // --------------------------------
      // FOLLOW REQUESTS
      // --------------------------------

      followRequests:
        varchar(
          "follow_requests",
          {
            length: 30,
          },
        )
          .default("public")
          .notNull(),

      // --------------------------------
      // MESSAGES
      // --------------------------------

      messages:
        varchar(
          "messages",
          {
            length: 40,
          },
        )
          .default(
            "message_requests",
          )
          .notNull(),

      // --------------------------------
      // COMMENTS
      // --------------------------------

      comments:
        varchar(
          "comments",
          {
            length: 30,
          },
        )
          .default("friends")
          .notNull(),

      // --------------------------------
      // MENTIONS
      // --------------------------------

      mentions:
        varchar(
          "mentions",
          {
            length: 30,
          },
        )
          .default("friends")
          .notNull(),

      // --------------------------------
      // TAGS
      // --------------------------------

      tags:
        varchar(
          "tags",
          {
            length: 30,
          },
        )
          .default("friends")
          .notNull(),

      // --------------------------------
      // FRIENDS LIST
      // --------------------------------

      friendsListVisibility:
        varchar(
          "friends_list_visibility",
          {
            length: 20,
          },
        )
          .default("friends")
          .notNull(),

      // --------------------------------
      // FOLLOWERS LIST
      // --------------------------------

      followersVisibility:
        varchar(
          "followers_visibility",
          {
            length: 20,
          },
        )
          .default("friends")
          .notNull(),

      // --------------------------------
      // FOLLOWING LIST
      // --------------------------------

      followingVisibility:
        varchar(
          "following_visibility",
          {
            length: 20,
          },
        )
          .default("friends")
          .notNull(),

      // --------------------------------
      // REDOM ID
      // --------------------------------

      redomIdPublic:
        boolean(
          "redom_id_public",
        )
          .default(true)
          .notNull(),

      // --------------------------------
      // DISCOVERABILITY
      // --------------------------------

      discoverable:
        boolean(
          "discoverable",
        )
          .default(true)
          .notNull(),

      // --------------------------------
      // SEARCH ENGINE
      // --------------------------------

      searchEngineIndexing:
        boolean(
          "search_engine_indexing",
        )
          .default(true)
          .notNull(),

      // --------------------------------
      // SYSTEM
      // --------------------------------

      createdAt:
        timestamp(
          "created_at",
        )
          .defaultNow()
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
        )
          .defaultNow()
          .notNull(),
    },

    (table) => ({
      userIdUnique:
        unique(
          "user_privacy_user_id_unique",
        ).on(
          table.userId,
        ),
    }),
  );