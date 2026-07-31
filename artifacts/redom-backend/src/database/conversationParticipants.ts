import {
  pgTable,
  uuid,
  integer,
  boolean,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

import { conversations } from "./conversations";
import { userProfiles } from "./userProfiles";

export const conversationParticipants = pgTable(
  "conversation_participants",
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

    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),

    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id),

    /**
     * User that added this member.
     * Null when the creator
     * creates the conversation.
     */
    joinedBy: uuid("joined_by")
      .references(() => userProfiles.id),

    // ==================================================
    // ROLE
    // ==================================================

    /**
     * owner
     * admin
     * member
     */
    role: varchar("role", {
      length: 20,
    })
      .default("member")
      .notNull(),

    // ==================================================
    // MEMBERSHIP
    // ==================================================

    activeMember: boolean("active_member")
      .default(true)
      .notNull(),

    invited: boolean("invited")
      .default(false)
      .notNull(),

    joinRequestApproved: boolean(
      "join_request_approved",
    )
      .default(false)
      .notNull(),

    joinedByCreator: boolean(
      "joined_by_creator",
    )
      .default(false)
      .notNull(),

    rejoined: boolean("rejoined")
      .default(false)
      .notNull(),

    removedByCreator: boolean(
      "removed_by_creator",
    )
      .default(false)
      .notNull(),

    leftGroup: boolean("left_group")
      .default(false)
      .notNull(),

    // ==================================================
    // USER SETTINGS
    // ==================================================

    muted: boolean("muted")
      .default(false)
      .notNull(),

    pinned: boolean("pinned")
      .default(false)
      .notNull(),

    archived: boolean("archived")
      .default(false)
      .notNull(),

    notificationsEnabled: boolean(
      "notifications_enabled",
    )
      .default(true)
      .notNull(),

    mentionsOnly: boolean(
      "mentions_only",
    )
      .default(false)
      .notNull(),

    customNotificationSound: varchar(
      "custom_notification_sound",
      {
        length: 255,
      },
    ),

    appWallpaper: varchar(
      "app_wallpaper",
      {
        length: 255,
      },
    ),

    // ==================================================
    // UNREAD
    // ==================================================

    unreadMessageCount: integer(
      "unread_message_count",
    )
      .default(0)
      .notNull(),

    // ==================================================
    // TYPING
    // ==================================================

    isTyping: boolean("is_typing")
      .default(false)
      .notNull(),

    typingStartedAt: timestamp(
      "typing_started_at",
      {
        withTimezone: true,
      },
    ),

    // ==================================================
    // CALLS
    // ==================================================

    canJoinCalls: boolean(
      "can_join_calls",
    )
      .default(true)
      .notNull(),

    missedCallCount: integer(
      "missed_call_count",
    )
      .default(0)
      .notNull(),

    lastJoinedCallAt: timestamp(
      "last_joined_call_at",
      {
        withTimezone: true,
      },
    ),

    // ==================================================
    // RESTRICTIONS
    // ==================================================

    mutedByAdmin: boolean(
      "muted_by_admin",
    )
      .default(false)
      .notNull(),

    temporarilySuspended: boolean(
      "temporarily_suspended",
    )
      .default(false)
      .notNull(),

    permanentlyRemoved: boolean(
      "permanently_removed",
    )
      .default(false)
      .notNull(),

    // ==================================================
    // MODERATION
    // ==================================================

    warningCount: integer(
      "warning_count",
    )
      .default(0)
      .notNull(),

    removedByAi: boolean(
      "removed_by_ai",
    )
      .default(false)
      .notNull(),

    removedByAdmin: boolean(
      "removed_by_admin",
    )
      .default(false)
      .notNull(),

    reportCount: integer(
      "report_count",
    )
      .default(0)
      .notNull(),

    // ==================================================
    // PRESENCE
    // ==================================================

    online: boolean("online")
      .default(false)
      .notNull(),

    doNotDisturb: boolean(
      "do_not_disturb",
    )
      .default(false)
      .notNull(),

    // ==================================================
    // TIMESTAMPS
    // ==================================================

    joinedAt: timestamp("joined_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    leftAt: timestamp("left_at", {
      withTimezone: true,
    }),

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
  },
);