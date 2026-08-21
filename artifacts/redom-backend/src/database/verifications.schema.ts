import {
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

/**
 * ReDom Verification Challenges
 *
 * This table is the authoritative database record
 * for OTP/security verification challenges.
 *
 * IMPORTANT:
 *
 * userId is nullable.
 *
 * This is intentional because:
 *
 * signup
 * password recovery
 * account recovery
 *
 * can begin before a users.id exists or before the
 * user is authenticated.
 */
export const verifications =
  pgTable(
    "verifications",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),

      /**
       * Existing account when known.
       *
       * NULL is valid for:
       *
       * - new registration
       * - unauthenticated recovery
       * - pre-account verification
       */
      userId: uuid("user_id")
        .references(
          () => users.id,
          {
            onDelete:
              "cascade",
          },
        ),

      /**
       * Broad verification type.
       *
       * email
       * phone
       * security
       */
      type: varchar(
        "type",
        {
          length: 30,
        },
      ).notNull(),

      /**
       * Exact backend-controlled purpose.
       */
      purpose: varchar(
        "purpose",
        {
          length: 50,
        },
      ).notNull(),

      /**
       * Exact target supplied for this challenge.
       *
       * Example:
       *
       * +2348000000000
       * person@example.com
       */
      target: varchar(
        "target",
        {
          length: 255,
        },
      ).notNull(),

      /**
       * Canonical target used internally for matching.
       *
       * For email:
       * lowercase normalized email.
       *
       * For phone:
       * normalized E.164 number.
       */
      normalizedTarget: varchar(
        "normalized_target",
        {
          length: 255,
        },
      ).notNull(),

      /**
       * Delivery channel.
       *
       * email
       * sms
       * whatsapp
       */
      channel: varchar(
        "channel",
        {
          length: 20,
        },
      ).notNull(),

      /**
       * Requested OTP length from frontend.
       */
      requestedLength: varchar(
        "requested_length",
        {
          length: 2,
        },
      ).notNull(),

      /**
       * Actual generated OTP length.
       *
       * Kept separately so backend remains
       * authoritative even if request metadata changes.
       */
      codeLength: varchar(
        "code_length",
        {
          length: 2,
        },
      ).notNull(),

      /**
       * SHA-256 OTP digest.
       *
       * Plaintext OTP is NEVER stored.
       */
      codeHash: varchar(
        "code_hash",
        {
          length: 64,
        },
      ).notNull(),

      /**
       * Challenge lifecycle status.
       */
      status: varchar(
        "status",
        {
          length: 30,
        },
      )
        .default(
          "pending",
        )
        .notNull(),

      /**
       * Failed verification attempts.
       */
      attemptCount: varchar(
        "attempt_count",
        {
          length: 10,
        },
      )
        .default("0")
        .notNull(),

      /**
       * Maximum failed attempts permitted.
       */
      maxAttempts: varchar(
        "max_attempts",
        {
          length: 10,
        },
      )
        .default("5")
        .notNull(),

      /**
       * Provider actually used for delivery.
       *
       * Example:
       *
       * twilio
       * infobip
       * msg91
       * termii
       * messagebird
       * resend
       */
      provider: varchar(
        "provider",
        {
          length: 50,
        },
      ),

      /**
       * Provider-side message/reference ID.
       */
      providerReference:
        varchar(
          "provider_reference",
          {
            length: 255,
          },
        ),

      /**
       * Request source metadata.
       */
      requestIp: varchar(
        "request_ip",
        {
          length: 100,
        },
      ),

      userAgent: varchar(
        "user_agent",
        {
          length: 1000,
        },
      ),

      deviceId: varchar(
        "device_id",
        {
          length: 255,
        },
      ),

      /**
       * Existing authenticated session when available.
       */
      sessionId: uuid(
        "session_id",
      ),

      /**
       * Challenge expiration.
       */
      expiresAt:
        timestamp(
          "expires_at",
          {
            withTimezone:
              true,
          },
        ).notNull(),

      /**
       * Successful verification time.
       */
      verifiedAt:
        timestamp(
          "verified_at",
          {
            withTimezone:
              true,
          },
        ),

      /**
       * Challenge consumption time.
       */
      consumedAt:
        timestamp(
          "consumed_at",
          {
            withTimezone:
              true,
          },
        ),

      /**
       * Creation timestamp.
       */
      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,
          },
        )
          .defaultNow()
          .notNull(),

      /**
       * Modification timestamp.
       */
      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,
          },
        )
          .defaultNow()
          .notNull(),
    },

    (table) => ({
      userIdx:
        index(
          "verifications_user_idx",
        ).on(
          table.userId,
        ),

      purposeIdx:
        index(
          "verifications_purpose_idx",
        ).on(
          table.purpose,
        ),

      targetIdx:
        index(
          "verifications_target_idx",
        ).on(
          table.normalizedTarget,
        ),

      statusIdx:
        index(
          "verifications_status_idx",
        ).on(
          table.status,
        ),

      expiresIdx:
        index(
          "verifications_expires_idx",
        ).on(
          table.expiresAt,
        ),

      challengeLookupIdx:
        index(
          "verifications_challenge_lookup_idx",
        ).on(
          table.userId,
          table.purpose,
          table.normalizedTarget,
          table.status,
        ),
    }),
  );