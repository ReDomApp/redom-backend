import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const verifications =
  pgTable(
    "verifications",
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

      type: varchar(
        "type",
        {
          length: 20,
        },
      ).notNull(),

      target: varchar(
        "target",
        {
          length: 255,
        },
      ).notNull(),

      /**
       * Email verification:
       * locally generated code hash.
       *
       * Phone verification:
       * provider-owned code,
       * therefore nullable.
       */
      codeHash: varchar(
        "code_hash",
        {
          length: 255,
        },
      ),

      /**
       * Provider-owned verification
       * identifier where applicable.
       */
      providerReference:
        varchar(
          "provider_reference",
          {
            length: 255,
          },
        ),

      status: varchar(
        "status",
        {
          length: 20,
        },
      )
        .default(
          "pending",
        )
        .notNull(),

      expiresAt:
        timestamp(
          "expires_at",
          {
            withTimezone:
              true,
          },
        )
          .notNull(),

      verifiedAt:
        timestamp(
          "verified_at",
          {
            withTimezone:
              true,
          },
        ),

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
    },

    (table) => ({
      userIdx: index(
        "verifications_user_idx",
      ).on(
        table.userId,
      ),

      typeIdx: index(
        "verifications_type_idx",
      ).on(
        table.type,
      ),

      targetIdx: index(
        "verifications_target_idx",
      ).on(
        table.target,
      ),

      statusIdx: index(
        "verifications_status_idx",
      ).on(
        table.status,
      ),

      expiresIdx: index(
        "verifications_expires_idx",
      ).on(
        table.expiresAt,
      ),
    }),
  );