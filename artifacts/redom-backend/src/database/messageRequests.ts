import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";
import { conversations } from "./conversations";

export const messageRequests = pgTable(
  "message_requests",
  {

    // ==================================================
    // INTERNAL ID
    // ==================================================

    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    // ==================================================
    // RELATIONSHIPS
    // ==================================================

    senderId: uuid("sender_id")
      .notNull()
      .references(() => userProfiles.id),

    receiverId: uuid("receiver_id")
      .notNull()
      .references(() => userProfiles.id),

    /**
     * Created after request is accepted.
     */
    conversationId: uuid("conversation_id")
      .references(() => conversations.id),

    // ==================================================
    // REQUEST STATUS
    // ==================================================

    /**
     * pending
     * accepted
     * declined
     * ignored
     * cancelled
     * expired
     * blocked
     */
    requestStatus: varchar(
      "request_status",
      {
        length: 30,
      },
    )
      .default("pending")
      .notNull(),

    // ==================================================
    // ELIGIBILITY
    // ==================================================

    receiverAcceptsRequests: boolean(
      "receiver_accepts_requests",
    )
      .default(true)
      .notNull(),

    senderBlocked: boolean(
      "sender_blocked",
    )
      .default(false)
      .notNull(),

    senderRestricted: boolean(
      "sender_restricted",
    )
      .default(false)
      .notNull(),

    spamCheckPassed: boolean(
      "spam_check_passed",
    )
      .default(true)
      .notNull(),

    // ==================================================
    // PREVIEW
    // ==================================================

    firstMessageViewed: boolean(
      "first_message_viewed",
    )
      .default(false)
      .notNull(),

    mutualFriends: integer(
      "mutual_friends",
    )
      .default(0)
      .notNull(),

    // ==================================================
    // ACTIONS
    // ==================================================

    accepted: boolean("accepted")
      .default(false)
      .notNull(),

    declined: boolean("declined")
      .default(false)
      .notNull(),

    ignored: boolean("ignored")
      .default(false)
      .notNull(),

    cancelled: boolean("cancelled")
      .default(false)
      .notNull(),

    reported: boolean("reported")
      .default(false)
      .notNull(),

    blocked: boolean("blocked")
      .default(false)
      .notNull(),

    // ==================================================
    // MODERATION
    // ==================================================

    aiReviewed: boolean(
      "ai_reviewed",
    )
      .default(false)
      .notNull(),

    spamDetected: boolean(
      "spam_detected",
    )
      .default(false)
      .notNull(),

    scamDetected: boolean(
      "scam_detected",
    )
      .default(false)
      .notNull(),

    adultContentDetected: boolean(
      "adult_content_detected",
    )
      .default(false)
      .notNull(),

    malwareDetected: boolean(
      "malware_detected",
    )
      .default(false)
      .notNull(),

    reportCount: integer(
      "report_count",
    )
      .default(0)
      .notNull(),

    // ==================================================
    // NOTIFICATIONS
    // ==================================================

    senderNotifiedAccepted: boolean(
      "sender_notified_accepted",
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

    expired: boolean("expired")
      .default(false)
      .notNull(),

    /**
     * User blocked after request.
     * "User not found" until unblocked.
     */
    userNotFound: boolean(
      "user_not_found",
    )
      .default(false)
      .notNull(),

    // ==================================================
    // SYSTEM
    // ==================================================

    createdAt: timestamp(
      "created_at",
      {
        withTimezone: true,
      },
    )
      .defaultNow()
      .notNull(),

    updatedAt: timestamp(
      "updated_at",
      {
        withTimezone: true,
      },
    )
      .defaultNow()
      .notNull(),

    acceptedAt: timestamp(
      "accepted_at",
      {
        withTimezone: true,
      },
    ),

    declinedAt: timestamp(
      "declined_at",
      {
        withTimezone: true,
      },
    ),

    ignoredAt: timestamp(
      "ignored_at",
      {
        withTimezone: true,
      },
    ),

    cancelledAt: timestamp(
      "cancelled_at",
      {
        withTimezone: true,
      },
    ),

    expiredAt: timestamp(
      "expired_at",
      {
        withTimezone: true,
      },
    ),

  },
);