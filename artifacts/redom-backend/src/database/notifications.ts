import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  check,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import { userProfiles } from "./userProfiles";

export const notifications =
  pgTable(
    "notifications",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),

      recipientUserId:
        uuid(
          "recipient_user_id",
        )
          .notNull()
          .references(
            () =>
              userProfiles.id,
          ),

      actorUserId:
        uuid("actor_user_id")
          .references(
            () =>
              userProfiles.id,
          ),

      postId: uuid("post_id"),

      commentId:
        uuid("comment_id"),

      messageId:
        uuid("message_id"),

      conversationId:
        uuid(
          "conversation_id",
        ),

      callId: uuid("call_id"),

      storyId:
        uuid("story_id"),

      reelId:
        uuid("reel_id"),

      videoId:
        uuid("video_id"),

      pollId:
        uuid("poll_id"),

      groupId:
        uuid("group_id"),

      marketplaceListingId:
        uuid(
          "marketplace_listing_id",
        ),

      verificationId:
        uuid(
          "verification_id",
        ),

      notificationType:
        varchar(
          "notification_type",
          {
            length: 60,
          },
        ).notNull(),

      title: varchar(
        "title",
        {
          length: 255,
        },
      ),

      body: text("body"),

      imageUrl:
        text("image_url"),

      actionUrl:
        text("action_url"),

      actorCount:
        integer("actor_count")
          .default(1)
          .notNull(),

      unread:
        boolean("unread")
          .default(true)
          .notNull(),

      read:
        boolean("read")
          .default(false)
          .notNull(),

      archived:
        boolean("archived")
          .default(false)
          .notNull(),

      deleted:
        boolean("deleted")
          .default(false)
          .notNull(),

      pushSent:
        boolean("push_sent")
          .default(false)
          .notNull(),

      inAppDelivered:
        boolean(
          "in_app_delivered",
        )
          .default(true)
          .notNull(),

      emailSent:
        boolean("email_sent")
          .default(false)
          .notNull(),

      smsSent:
        boolean("sms_sent")
          .default(false)
          .notNull(),

      opened:
        boolean("opened")
          .default(false)
          .notNull(),

      dismissed:
        boolean("dismissed")
          .default(false)
          .notNull(),

      muted:
        boolean("muted")
          .default(false)
          .notNull(),

      priority:
        varchar(
          "priority",
          {
            length: 20,
          },
        )
          .default("normal")
          .notNull(),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .defaultNow()
          .notNull(),

      readAt:
        timestamp(
          "read_at",
          {
            withTimezone: true,
          },
        ),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .defaultNow()
          .notNull(),
    },

    (table) => ({
      readStateConsistency:
        check(
          "notifications_read_state_consistency",
          sql`"read" = NOT "unread"`,
        ),
    }),
  );