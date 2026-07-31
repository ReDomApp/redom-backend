import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const marketplaceCategories = pgTable(
  "marketplace_categories",
  {

    // ==================================================
    // INTERNAL ID
    // ==================================================

    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

    // ==================================================
    // CATEGORY
    // ==================================================

    name: varchar("name", {
      length: 100,
    })
      .notNull()
      .unique(),

    slug: varchar("slug", {
      length: 120,
    })
      .notNull()
      .unique(),

    description: text("description"),

    icon: text("icon"),

    bannerImageUrl: text(
      "banner_image_url",
    ),

    // ==================================================
    // HIERARCHY
    // ==================================================

    parentCategoryId: uuid(
      "parent_category_id",
    ),

    level: integer("level")
      .default(1)
      .notNull(),

    // ==================================================
    // DEFAULT MARKETPLACE SETTINGS
    // ==================================================

    allowOffers: boolean(
      "allow_offers",
    )
      .default(true)
      .notNull(),

    allowShipping: boolean(
      "allow_shipping",
    )
      .default(true)
      .notNull(),

    allowPickup: boolean(
      "allow_pickup",
    )
      .default(true)
      .notNull(),

    allowReturns: boolean(
      "allow_returns",
    )
      .default(false)
      .notNull(),

    moderationRequired: boolean(
      "moderation_required",
    )
      .default(true)
      .notNull(),

    // ==================================================
    // STATUS
    // ==================================================

    /**
     * active
     * hidden
     * archived
     */
    status: varchar("status", {
      length: 20,
    })
      .default("active")
      .notNull(),

    // ==================================================
    // ANALYTICS
    // ==================================================

    totalListings: integer(
      "total_listings",
    )
      .default(0)
      .notNull(),

    totalSales: integer(
      "total_sales",
    )
      .default(0)
      .notNull(),

    displayOrder: integer(
      "display_order",
    )
      .default(0)
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

  },
);