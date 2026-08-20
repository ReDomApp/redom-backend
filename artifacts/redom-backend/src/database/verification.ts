import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const verification =
  pgTable(
    "verification",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),

      userId: uuid("user_id")
        .notNull()
        .unique()
        .references(
          () => users.id,
          {
            onDelete:
              "cascade",
          },
        ),

      // -------------------------------------------------------
      // IDENTITY VERIFICATION STATE
      // -------------------------------------------------------

      verificationStatus:
        varchar(
          "verification_status",
          {
            length: 30,
          },
        )
          .default(
            "not_started",
          )
          .notNull(),

      /*
       * not_started
       * requested
       * pending
       * approved
       * rejected
       * suspended
       * revoked
       */

      /*
       * The backend does NOT assume what kind of identity
       * verification the frontend will request.
       *
       * The selected document/request is represented by
       * verificationDocuments.
       */

      // -------------------------------------------------------
      // REQUEST / REVIEW LIFECYCLE
      // -------------------------------------------------------

      requestedAt:
        timestamp(
          "requested_at",
        ),

      applicationSubmittedAt:
        timestamp(
          "application_submitted_at",
        ),

      reviewStartedAt:
        timestamp(
          "review_started_at",
        ),

      approvedAt:
        timestamp(
          "approved_at",
        ),

      rejectedAt:
        timestamp(
          "rejected_at",
        ),

      suspendedAt:
        timestamp(
          "suspended_at",
        ),

      revokedAt:
        timestamp(
          "revoked_at",
        ),

      expiresAt:
        timestamp(
          "expires_at",
        ),

      // -------------------------------------------------------
      // REVIEW INFORMATION
      // -------------------------------------------------------

      rejectionReason:
        varchar(
          "rejection_reason",
          {
            length: 1000,
          },
        ),

      revocationReason:
        varchar(
          "revocation_reason",
          {
            length: 1000,
          },
        ),

      suspensionReason:
        varchar(
          "suspension_reason",
          {
            length: 1000,
          },
        ),

      reviewNotes:
        varchar(
          "review_notes",
          {
            length: 3000,
          },
        ),

      reviewedBy:
        varchar(
          "reviewed_by",
          {
            length: 100,
          },
        ),

      reviewProvider:
        varchar(
          "review_provider",
          {
            length: 100,
          },
        ),

      // -------------------------------------------------------
      // USER-FACING VERIFICATION STATE
      // -------------------------------------------------------

      badgeVisible:
        boolean(
          "badge_visible",
        )
          .default(false)
          .notNull(),

      canReapply:
        boolean(
          "can_reapply",
        )
          .default(true)
          .notNull(),

      // -------------------------------------------------------
      // AUDIT
      // -------------------------------------------------------

      applicationAttempts:
        varchar(
          "application_attempts",
          {
            length: 10,
          },
        )
          .default("0")
          .notNull(),

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
      userIdx:
        index(
          "verification_user_idx",
        ).on(
          table.userId,
        ),

      statusIdx:
        index(
          "verification_status_idx",
        ).on(
          table.verificationStatus,
        ),
    }),
  );