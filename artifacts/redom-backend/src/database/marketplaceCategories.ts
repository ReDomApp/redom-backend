import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const marketplaceCategories =
  pgTable(
    "marketplace_categories",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),

      name: varchar(
        "name",
        {
          length: 100,
        },
      )
        .notNull()
        .unique(),

      slug: varchar(
        "slug",
        {
          length: 120,
        },
      )
        .notNull()
        .unique(),

      description:
        text("description"),

      icon: text("icon"),

      bannerImageUrl:
        text("banner_image_url"),

      parentCategoryId:
        uuid(
          "parent_category_id",
        ).references(
          (): AnyPgColumn =>
            marketplaceCategories.id,
          {
            onDelete:
              "set null",
            onUpdate:
              "cascade",
          },
        ),

      level:
        integer("level")
          .default(1)
          .notNull(),

      allowOffers:
        boolean("allow_offers")
          .default(true)
          .notNull(),

      allowShipping:
        boolean("allow_shipping")
          .default(true)
          .notNull(),

      allowPickup:
        boolean("allow_pickup")
          .default(true)
          .notNull(),

      allowReturns:
        boolean("allow_returns")
          .default(false)
          .notNull(),

      moderationRequired:
        boolean(
          "moderation_required",
        )
          .default(true)
          .notNull(),

      status:
        varchar(
          "status",
          {
            length: 20,
          },
        )
          .default("active")
          .notNull(),

      totalListings:
        integer(
          "total_listings",
        )
          .default(0)
          .notNull(),

      totalSales:
        integer(
          "total_sales",
        )
          .default(0)
          .notNull(),

      displayOrder:
        integer(
          "display_order",
        )
          .default(0)
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
      parentCategoryIdx:
        index(
          "marketplace_categories_parent_category_idx",
        ).on(
          table.parentCategoryId,
        ),
    }),
  );
