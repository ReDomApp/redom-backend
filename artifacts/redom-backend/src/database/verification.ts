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

      /*
       * ReDom-selected KYC provider.
       *
       * Examples:
       * veriff
       * persona
       */
      reviewProvider:
        varchar(
          "review_provider",
          {
            length: 100,
          },
        ),

      /*
       * Provider-side verification/session
       * identifiers.
       *
       * These are correlation values only.
       * The provider remains authoritative for
       * the identity-verification result.
       */
      providerReference:
        varchar(
          "provider_reference",
          {
            length: 255,
          },
        ),

      providerSessionId:
        varchar(
          "provider_session_id",
          {
            length: 255,
          },
        ),

      providerStatus:
        varchar(
          "provider_status",
          {
            length: 100,
          },
        ),

      providerUpdatedAt:
        timestamp(
          "provider_updated_at",
        ),

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

      providerReferenceIdx:
        index(
          "verification_provider_reference_idx",
        ).on(
          table.providerReference,
        ),
    }),
  );