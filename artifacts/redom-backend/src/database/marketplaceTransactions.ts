import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";
import { marketplaceListings } from "./marketplaceListings";

export const marketplaceTransactions = pgTable(
  "marketplace_transactions",
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

    sellerUserId: uuid("seller_user_id")
      .notNull()
      .references(() => userProfiles.id),

    buyerUserId: uuid("buyer_user_id")
      .notNull()
      .references(() => userProfiles.id),

    // ==================================================
    // PUBLIC TRANSACTION ID
    // ==================================================

    /**
     * Numeric only
     * Starts with 979
     * Example:
     * 9791234567
     *
     * Generated from:
     * src/utils/idGenerator.ts
     */
    transactionId: varchar("transaction_id", {
      length: 10,
    })
      .notNull()
      .unique(),

    // ==================================================
    // ORDER
    // ==================================================

    quantity: integer("quantity")
      .default(1)
      .notNull(),

    unitPrice: numeric("unit_price", {
      precision: 15,
      scale: 2,
    }).notNull(),

    totalPrice: numeric("total_price", {
      precision: 15,
      scale: 2,
    }).notNull(),

    currency: varchar("currency", {
      length: 10,
    }).notNull(),

    // ==================================================
    // PAYMENT
    // ==================================================

    /**
     * card
     * bank_transfer
     * wallet
     * cash_on_delivery
     * other
     */
    paymentMethod: varchar(
      "payment_method",
      {
        length: 40,
      },
    ),

    /**
     * stripe
     * flutterwave
     * paypal
     * paystack
     * other
     */
    paymentProvider: varchar(
      "payment_provider",
      {
        length: 50,
      },
    ),

    transactionReference: varchar(
      "transaction_reference",
      {
        length: 255,
      },
    ),

    /**
     * pending
     * processing
     * paid
     * failed
     * refunded
     * partially_refunded
     * cancelled
     */
    paymentStatus: varchar(
      "payment_status",
      {
        length: 30,
      },
    )
      .default("pending")
      .notNull(),

    // ==================================================
    // ORDER STATUS
    // ==================================================

    /**
     * pending
     * confirmed
     * packed
     * shipped
     * out_for_delivery
     * delivered
     * completed
     * cancelled
     * returned
     */
    orderStatus: varchar(
      "order_status",
      {
        length: 30,
      },
    )
      .default("pending")
      .notNull(),

    // ==================================================
    // SHIPPING
    // ==================================================

    shippingAddressId: uuid(
      "shipping_address_id",
    ),

    shippingCost: numeric(
      "shipping_cost",
      {
        precision: 15,
        scale: 2,
      },
    ),

    trackingNumber: varchar(
      "tracking_number",
      {
        length: 150,
      },
    ),

    courierName: varchar(
      "courier_name",
      {
        length: 100,
      },
    ),

    estimatedDeliveryDate: timestamp(
      "estimated_delivery_date",
      {
        withTimezone: true,
      },
    ),

    deliveredAt: timestamp(
      "delivered_at",
      {
        withTimezone: true,
      },
    ),

    // ==================================================
    // BUYER PROTECTION
    // ==================================================

    buyerProtectionEnabled: boolean(
      "buyer_protection_enabled",
    )
      .default(true)
      .notNull(),

    refundRequested: boolean(
      "refund_requested",
    )
      .default(false)
      .notNull(),

    refundApproved: boolean(
      "refund_approved",
    )
      .default(false)
      .notNull(),

    refundCompleted: boolean(
      "refund_completed",
    )
      .default(false)
      .notNull(),

    returnRequested: boolean(
      "return_requested",
    )
      .default(false)
      .notNull(),

    returnApproved: boolean(
      "return_approved",
    )
      .default(false)
      .notNull(),

    returnCompleted: boolean(
      "return_completed",
    )
      .default(false)
      .notNull(),

    // ==================================================
    // CANCELLATION
    // ==================================================

    /**
     * buyer
     * seller
     * system
     */
    cancelledBy: varchar(
      "cancelled_by",
      {
        length: 20,
      },
    ),

    cancellationReason: text(
      "cancellation_reason",
    ),

    cancelledAt: timestamp(
      "cancelled_at",
      {
        withTimezone: true,
      },
    ),

    // ==================================================
    // ANALYTICS
    // ==================================================

    sellerRated: boolean(
      "seller_rated",
    )
      .default(false)
      .notNull(),

    buyerRated: boolean(
      "buyer_rated",
    )
      .default(false)
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

    paidAt: timestamp(
      "paid_at",
      {
        withTimezone: true,
      },
    ),

    completedAt: timestamp(
      "completed_at",
      {
        withTimezone: true,
      },
    ),

  },
);