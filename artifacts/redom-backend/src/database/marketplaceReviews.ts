import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";
import { marketplaceListings } from "./marketplaceListings";
import { marketplaceTransactions } from "./marketplaceTransactions";

export const marketplaceReviews = pgTable(
  "marketplace_reviews",
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

    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => marketplaceTransactions.id),

    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListings.id),

    reviewerUserId: uuid("reviewer_user_id")
      .notNull()
      .references(() => userProfiles.id),

    reviewedUserId: uuid("reviewed_user_id")
      .notNull()
      .references(() => userProfiles.id),

    // ==================================================
    // REVIEW TYPE
    // ==================================================

    /**
     * seller
     * buyer
     */
    reviewType: varchar("review_type", {
      length: 20,
    })
      .notNull(),

    // ==================================================
    // RATING
    // ==================================================

    /**
     * 1–5 Stars
     */
    rating: integer("rating")
      .notNull(),

    title: varchar("title", {
      length: 150,
    }),

    review: text("review"),

    // ==================================================
    // RECOMMENDATION
    // ==================================================

    recommendSeller: boolean(
      "recommend_seller",
    ),

    recommendBuyer: boolean(
      "recommend_buyer",
    ),

    // ==================================================
    // SELLER PERFORMANCE
    // ==================================================

    itemAsDescribed: boolean(
      "item_as_described",
    ),

    communication: boolean(
      "communication",
    ),

    shippingSpeed: boolean(
      "shipping_speed",
    ),

    // ==================================================
    // BUYER PERFORMANCE
    // ==================================================

    promptPayment: boolean(
      "prompt_payment",
    ),

    respectfulCommunication: boolean(
      "respectful_communication",
    ),

    // ==================================================
    // MODERATION
    // ==================================================

    hidden: boolean("hidden")
      .default(false)
      .notNull(),

    reported: boolean("reported")
      .default(false)
      .notNull(),

    moderatorNotes: text(
      "moderator_notes",
    ),

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