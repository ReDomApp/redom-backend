import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const userProfiles = pgTable(
  "user_profiles",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(
        () => users.id,
        {
          onDelete: "cascade",
        },
      ),

    profileType: varchar(
      "profile_type",
      {
        length: 30,
      },
    )
      .default("personal")
      .notNull(),

    displayName: varchar(
      "display_name",
      {
        length: 100,
      },
    ).notNull(),

    bio: text("bio"),

    profilePhoto: varchar(
      "profile_photo",
      {
        length: 500,
      },
    ),

    coverPhoto: varchar(
      "cover_photo",
      {
        length: 500,
      },
    ),

    website: varchar(
      "website",
      {
        length: 255,
      },
    ),

    occupation: varchar(
      "occupation",
      {
        length: 150,
      },
    ),

    education: varchar(
      "education",
      {
        length: 150,
      },
    ),

    hometown: varchar(
      "hometown",
      {
        length: 100,
      },
    ),

    currentCity: varchar(
      "current_city",
      {
        length: 100,
      },
    ),

    relationshipStatus:
      varchar(
        "relationship_status",
        {
          length: 50,
        },
      ),

    pronouns: varchar(
      "pronouns",
      {
        length: 30,
      },
    ),

    profileVisibility:
      varchar(
        "profile_visibility",
        {
          length: 20,
        },
      )
        .default("public")
        .notNull(),

    verified: boolean(
      "verified",
    )
      .default(false)
      .notNull(),

    displayJoinDate:
      boolean(
        "display_join_date",
      )
        .default(true)
        .notNull(),

    profileCompletion:
      integer(
        "profile_completion",
      )
        .default(0)
        .notNull(),

    followerCount:
      integer(
        "follower_count",
      )
        .default(0)
        .notNull(),

    followingCount:
      integer(
        "following_count",
      )
        .default(0)
        .notNull(),

    friendCount:
      integer(
        "friend_count",
      )
        .default(0)
        .notNull(),

    postCount:
      integer(
        "post_count",
      )
        .default(0)
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
    userIdUnique:
      uniqueIndex(
        "user_profiles_user_id_unique",
      ).on(
        table.userId,
      ),
  }),
);