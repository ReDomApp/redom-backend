import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";
import { marketplaceListings } from "./marketplaceListings";

export const marketplaceInteractions = pgTable(
  "marketplace_interactions",
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

    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListings.id),

    buyerUserId: uuid("buyer_user_id")
      .notNull()
      .references(() => userProfiles.id),

    sellerUserId: uuid("seller_user_id")
      .notNull()
      .references(() => userProfiles.id),

    // ==================================================
    // INTERACTION
    // ==================================================

    /**
     * favorite
     * offer
     */
    interactionType: varchar(
      "interaction_type",
      {
        length: 20,
      },
    )
      .notNull(),

    // ==================================================
    // FAVORITES
    // ==================================================

    favorite: boolean("favorite")
      .default(false)
      .notNull(),

    favoritedAt: timestamp(
      "favorited_at",
      {
        withTimezone: true,
      },
    ),

    // ==================================================
    // OFFERS
    // ==================================================

    offerPrice: numeric(
      "offer_price",
      {
        precision: 15,
        scale: 2,
      },
    ),

    currency: varchar("currency", {
      length: 10,
    }),

    offerMessage: text(
      "offer_message",
    ),

    /**
     * pending
     * accepted
     * rejected
     * countered
     * withdrawn
     * expired
     */
    offerStatus: varchar(
      "offer_status",
      {
        length: 20,
      },
    )
      .default("pending")
      .notNull(),

    // ==================================================
    // COUNTER OFFER
    // ==================================================

    counterOfferPrice: numeric(
      "counter_offer_price",
      {
        precision: 15,
        scale: 2,
      },
    ),

    counterOfferMessage: text(
      "counter_offer_message",
    ),

    // ==================================================
    // EXPIRATION
    // ==================================================

    offerExpiresAt: timestamp(
      "offer_expires_at",
      {
        withTimezone: true,
      },
    ),

    // ==================================================
    // ANALYTICS
    // ==================================================

    offerViewed: boolean(
      "offer_viewed",
    )
      .default(false)
      .notNull(),

    offerViewedAt: timestamp(
      "offer_viewed_at",
      {
        withTimezone: true,
      },
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