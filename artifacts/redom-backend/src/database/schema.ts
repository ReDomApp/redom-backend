import {
  boolean,
  check,
  date,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  ACCOUNT_STATUS_VALUES,
  PROFILE_ID_VISIBILITY_VALUES,
} from "../types/userStatusEnums";

import {
  GENDER_VALUES,
} from "../types/genderEnums";

import { sql } from "drizzle-orm";

/**
 * ------------------------------------------------------------
 * CANONICAL ACCOUNT ENUMS
 * ------------------------------------------------------------
 */

export const genderEnum = pgEnum(
  "gender",
  GENDER_VALUES,
);

export const accountStatusEnum = pgEnum(
  "account_status",
  ACCOUNT_STATUS_VALUES,
);

export const profileIdVisibilityEnum = pgEnum(
  "profile_id_visibility",
  PROFILE_ID_VISIBILITY_VALUES,
);

/**
 * ------------------------------------------------------------
 * USERS
 * ------------------------------------------------------------
 *
 * Identity hierarchy:
 *
 * id
 *   └── internal database identity
 *
 * username
 *   └── human-selected @username
 *
 * publicId
 *   └── ReDom numeric public identifier
 *
 * profileId
 *   └── stable ReDom profile/account identifier
 *
 * These identifiers MUST NOT be conflated.
 * ------------------------------------------------------------
 */

export const users = pgTable(
  "users",
  {
    /**
     * Internal database identity.
     *
     * Never exposed as the user's public identity.
     */
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    /**
     * Legal/display identity.
     */
    firstName: varchar(
      "first_name",
      {
        length: 100,
      },
    ).notNull(),

    lastName: varchar(
      "last_name",
      {
        length: 100,
      },
    ).notNull(),

    /**
     * Human-selected ReDom username.
     *
     * Example:
     *
     * @johnsmith
     *
     * This is NOT the Public ID.
     */
    username: varchar(
      "username",
      {
        length: 50,
      },
    ).notNull(),

    /**
     * ReDom numeric Public ID.
     *
     * Example:
     *
     * 234583928174521
     *
     * This is NOT the username.
     */
    publicId: varchar(
      "public_id",
      {
        length: 15,
      },
    ).notNull(),

    /**
     * Stable ReDom profile identifier.
     */
    profileId: varchar(
      "profile_id",
      {
        length: 15,
      },
    ).notNull(),

    /**
     * Contact methods are intentionally nullable.
     *
     * Registration requires AT LEAST ONE of them,
     * but the user does not have to provide both.
     */
    email: varchar(
      "email",
      {
        length: 255,
      },
    ),

    phoneNumber: varchar(
      "phone_number",
      {
        length: 20,
      },
    ),

    /**
     * Password credential.
     */
    passwordHash: varchar(
      "password_hash",
      {
        length: 255,
      },
    ).notNull(),

    /**
     * Optional demographic information.
     */
    dateOfBirth: date(
      "date_of_birth",
    ),

    gender: genderEnum(
      "gender",
    ),

    /**
     * Controls whether the ReDom Public ID may be
     * exposed/resolved publicly.
     *
     * public  → Public ID may participate in public
     *            profile identity/URL resolution.
     *
     * private → Public ID must not be used as a public
     *            profile lookup identifier.
     */
    profileIdVisibility:
      profileIdVisibilityEnum(
        "profile_id_visibility",
      )
        .default("public")
        .notNull(),

    /**
     * Verification state.
     */
    emailVerified: boolean(
      "email_verified",
    )
      .default(false)
      .notNull(),

    phoneVerified: boolean(
      "phone_verified",
    )
      .default(false)
      .notNull(),

    /**
     * Account lifecycle state.
     */
    accountStatus: accountStatusEnum(
      "account_status",
    )
      .default("pending")
      .notNull(),

    createdAt: timestamp(
      "created_at",
    )
      .defaultNow()
      .notNull(),

    updatedAt: timestamp(
      "updated_at",
    )
      .defaultNow()
      .notNull(),
  },

  (table) => ({
    usernameUnique: uniqueIndex(
      "users_username_unique",
    ).on(table.username),

    publicIdUnique: uniqueIndex(
      "users_public_id_unique",
    ).on(table.publicId),

    profileIdUnique: uniqueIndex(
      "users_profile_id_unique",
    ).on(table.profileId),

    emailUnique: uniqueIndex(
      "users_email_unique",
    ).on(table.email),

    phoneNumberUnique: uniqueIndex(
      "users_phone_number_unique",
    ).on(table.phoneNumber),

    /**
     * At least one contact method must exist.
     *
     * The account can therefore register with:
     *
     * email only
     * OR
     * phone only
     *
     * and may add the other method later.
     */
    contactMethodRequired: check(
      "users_contact_method_required",
      sql`"email" IS NOT NULL OR "phone_number" IS NOT NULL`,
    ),

    /**
     * ReDom Public ID format.
     *
     * 234 + 12 digits
     */
    publicIdFormat: check(
      "users_public_id_format",
      sql`"public_id" ~ '^234[1-9][0-9]{11}$'`,
    ),

    /**
     * ReDom Profile ID format.
     *
     * 234 + 12 digits
     */
    profileIdFormat: check(
      "users_profile_id_format",
      sql`"profile_id" ~ '^234[1-9][0-9]{11}$'`,
    ),
  }),
);