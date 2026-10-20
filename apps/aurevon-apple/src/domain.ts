/** Provider-neutral domain types. No issuer-specific redemption code logic. */

export type OrderStatus =
  | "draft"
  | "pending_payment"
  | "paid"
  | "fulfillment_pending"
  | "fulfilled"
  | "payment_failed"
  | "fulfillment_failed"
  | "cancelled"
  | "refunded"
  | "disputed";

export interface GiftCardProduct {
  id: string;
  issuer: string;
  displayName: string;
  currency: string;
  region: string;
  denominationMinor: number;
  termsUrl?: string;
  active: boolean;
  supplyProviderId: string;
}

export interface GiftCardOrder {
  id: string;
  customerId: string;
  productId: string;
  quantity: number;
  currency: string;
  totalMinor: number;
  status: OrderStatus;
  idempotencyKey: string;
  providerOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FulfilledGiftCard {
  /** Secret reference, not a raw code. The secret is stored in a vault. */
  secretReference: string;
  issuer: string;
  denominationMinor: number;
  currency: string;
  region: string;
}

export interface FulfillmentResult {
  providerOrderId: string;
  cards: FulfilledGiftCard[];
}

export function assertValidQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new Error("quantity must be an integer between 1 and 10");
  }
}

export function assertCanFulfill(status: OrderStatus): void {
  if (status !== "paid" && status !== "fulfillment_pending") {
    throw new Error(`order cannot be fulfilled from status: ${status}`);
  }
}
