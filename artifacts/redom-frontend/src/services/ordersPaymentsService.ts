import { api } from "../api/client";

export interface OrderSummary {
  transactionId: string; title: string; quantity: number; totalPrice: string; currency: string;
  paymentStatus: string; orderStatus: string; trackingNumber: string | null; courierName: string | null;
  estimatedDeliveryDate: string | null; createdAt: string; updatedAt: string;
}
export interface PaymentSettings { currency: string; pin_enabled: boolean; biometric_enabled: boolean; }
export interface SubscriptionSummary {
  id: string; subscriptionType: string; subscriptionStatus: string; billingCycle: string;
  autoRenew: boolean; startedAt: string | null; renewedAt: string | null;
  expiresAt: string | null; cancelledAt: string | null; createdAt: string; updatedAt: string;
}
export const ordersPaymentsService = {
  overview() { return api.get<{ success: boolean; orders: OrderSummary[] }>("/orders-payments/overview"); },
  subscriptions() { return api.get<{ success: boolean; subscriptions: SubscriptionSummary[] }>("/orders-payments/subscriptions"); },
  getSettings() { return api.get<{ success: boolean; settings: PaymentSettings }>("/orders-payments/settings"); },
  updateSettings(input: { currency?: string; pinEnabled?: boolean; biometricEnabled?: boolean }) {
    return api.patch<{ success: boolean; settings: PaymentSettings }>("/orders-payments/settings", input);
  },
  starsActivity() { return api.get<{ success: boolean; balance: number; activity: Array<{ id:string; type:string; stars:number; balanceAfter:number; packageKey:string|null; countryCode:string|null; currency:string|null; amountMinor:number|null; reference:string|null; createdAt:string }> }>("/orders-payments/stars/activity"); },
  starsCatalog(countryCode?: string) { return api.get<{ success:boolean; countries:Array<{name:string;isoCode:string;currency:string}>; packages:Array<{key:string;stars:number;usdPrice:number;localAmount:number;localAmountFormatted:string;currency:string}> }>(countryCode ? "/orders-payments/stars/catalog?country="+encodeURIComponent(countryCode) : "/orders-payments/stars/catalog"); },
};
