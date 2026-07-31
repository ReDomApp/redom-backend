import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";

export const notifications = pgTable("notifications", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // USERS
  // ==================================================

  recipientUserId: uuid("recipient_user_id")
    .notNull()
    .references(() => userProfiles.id),

  actorUserId: uuid("actor_user_id")
    .references(() => userProfiles.id),

  // ==================================================
  // RELATED OBJECTS
  // ==================================================

  postId: uuid("post_id"),

  commentId: uuid("comment_id"),

  messageId: uuid("message_id"),

  conversationId: uuid("conversation_id"),

  callId: uuid("call_id"),

  storyId: uuid("story_id"),

  reelId: uuid("reel_id"),

  videoId: uuid("video_id"),

  pollId: uuid("poll_id"),

  groupId: uuid("group_id"),

  marketplaceListingId: uuid(
    "marketplace_listing_id",
  ),

  verificationId: uuid(
    "verification_id",
  ),

  // ==================================================
  // NOTIFICATION
  // ==================================================

  /**
   * friend_request
   * friend_accepted
   * follow
   * post_like
   * comment
   * reply
   * mention
   * tag
   * share
   * story_reaction
   * story_mention
   * message
   * message_request_accepted
   * incoming_call
   * group_invitation
   * group_update
   * marketplace
   * account_security
   * verification
   * system_announcement
   * page
   * event
   * live
   * creator
   * subscription
   * monetization
   */
  notificationType: varchar(
    "notification_type",
    {
      length: 60,
    },
  ).notNull(),

  title: varchar("title", {
    length: 255,
  }),

  body: text("body"),

  imageUrl: text("image_url"),

  actionUrl: text("action_url"),

  actorCount: integer("actor_count")
    .default(1)
    .notNull(),

  // ==================================================
  // STATUS
  // ==================================================

  unread: boolean("unread")
    .default(true)
    .notNull(),

  read: boolean("read")
    .default(false)
    .notNull(),

  archived: boolean("archived")
    .default(false)
    .notNull(),

  deleted: boolean("deleted")
    .default(false)
    .notNull(),

  // ==================================================
  // DELIVERY
  // ==================================================

  pushSent: boolean("push_sent")
    .default(false)
    .notNull(),

  inAppDelivered: boolean(
    "in_app_delivered",
  )
    .default(true)
    .notNull(),

  emailSent: boolean("email_sent")
    .default(false)
    .notNull(),

  smsSent: boolean("sms_sent")
    .default(false)
    .notNull(),

  // ==================================================
  // USER ACTIONS
  // ==================================================

  opened: boolean("opened")
    .default(false)
    .notNull(),

  dismissed: boolean("dismissed")
    .default(false)
    .notNull(),

  muted: boolean("muted")
    .default(false)
    .notNull(),

  // ==================================================
  // PRIORITY
  // ==================================================

  /**
   * low
   * normal
   * high
   * critical
   */
  priority: varchar("priority", {
    length: 20,
  })
    .default("normal")
    .notNull(),

  // ==================================================
  // SYSTEM
  // ==================================================

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  readAt: timestamp("read_at", {
    withTimezone: true,
  }),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

});