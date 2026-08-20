import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const userSettings =
  pgTable(
    "user_settings",
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
      // APPEARANCE
      // --------------------------------

      theme:
        varchar(
          "theme",
          {
            length: 20,
          },
        )
          .default("system")
          .notNull(),

      language:
        varchar(
          "language",
          {
            length: 20,
          },
        )
          .default("system")
          .notNull(),

      // --------------------------------
      // FEED
      // --------------------------------

      politicalContent:
        boolean(
          "political_content",
        )
          .default(true)
          .notNull(),

      followingFeed:
        boolean(
          "following_feed",
        )
          .default(true)
          .notNull(),

      followingFeedSnooze:
        varchar(
          "following_feed_snooze",
          {
            length: 20,
          },
        )
          .default("off")
          .notNull(),

      sensitiveContent:
        varchar(
          "sensitive_content",
          {
            length: 20,
          },
        )
          .default("standard")
          .notNull(),

      // --------------------------------
      // VIDEO
      // --------------------------------

      autoplayVideos:
        varchar(
          "autoplay_videos",
          {
            length: 20,
          },
        )
          .default("off")
          .notNull(),

      // --------------------------------
      // TRANSLATION
      // --------------------------------

      autoTranslatePosts:
        boolean(
          "auto_translate_posts",
        )
          .default(true)
          .notNull(),

      autoTranslateComments:
        boolean(
          "auto_translate_comments",
        )
          .default(true)
          .notNull(),

      // --------------------------------
      // ACCESSIBILITY
      // --------------------------------

      fontSize:
        varchar(
          "font_size",
          {
            length: 20,
          },
        )
          .default("medium")
          .notNull(),

      reduceMotion:
        boolean(
          "reduce_motion",
        )
          .default(false)
          .notNull(),

      highContrast:
        boolean(
          "high_contrast",
        )
          .default(false)
          .notNull(),

      screenReaderMode:
        boolean(
          "screen_reader_mode",
        )
          .default(false)
          .notNull(),

      captions:
        varchar(
          "captions",
          {
            length: 20,
          },
        )
          .default("automatic")
          .notNull(),

      // --------------------------------
      // PROFILE
      // --------------------------------

      showJoinDate:
        boolean(
          "show_join_date",
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
          "user_settings_user_id_unique",
        ).on(
          table.userId,
        ),
    }),
  );