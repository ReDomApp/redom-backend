import { api } from "../api/client";

export interface PaymentTransactionSummary { id:string; reference:string; redomTransactionId:string|null; amountMinor:string; currency:string; purpose:string; status:string; createdAt:string; paidAt:string|null; metadata:any; }\nexport interface OrderSummary {
  transactionId: string; title: string; quantity: number; totalPrice: string; currency: string;
  paymentStatus: string; orderStatus: string; trackingNumber: string | null; courierName: string | null;
  estimatedDeliveryDate: string | null; createdAt: string; updatedAt: string;
}
export interface PaymentSettings { currency: string; pin_enabled: boolean; biometric_enabled: boolean; }
export interface StarCountry { name: string; isoCode: string; currency: string; }
export interface StarPackage { key: string; stars: number; usdPrice: number; regularUsdPrice: number; firstPurchaseUsdPrice: number|null; firstPurchaseDiscountPercent: number; popular: boolean; localAmount: number; amountMinor: number; localAmountFormatted: string; currency: string; payable?: boolean; availabilityReason?: string | null; }
export interface StarTransaction { id:string; type:string; stars:number; balanceAfter:number; packageKey:string|null; countryCode:string|null; currency:string|null; amountMinor:number|null; reference:string|null; createdAt:string; }
export interface SavedPaymentMethod { id:string; provider:string; email:string; brand:string|null; cardType:string|null; last4:string|null; expMonth:number|null; expYear:number|null; bank:string|null; countryCode:string|null; currency:string|null; reusable:boolean; createdAt:string; }
export interface PaymentAddress { id:string; country_code:string; country_name:string; full_name:string; address_line1:string; address_line2:string|null; city:string; state:string|null; postal_code:string|null; mapbox_place_id:string|null; latitude:number|null; longitude:number|null; is_default:boolean; created_at:string; updated_at:string; }
export interface SubscriptionSummary {
  id: string; subscriptionType: string; subscriptionStatus: string; billingCycle: string;
  autoRenew: boolean; startedAt: string | null; renewedAt: string | null;
  expiresAt: string | null; cancelledAt: string | null; createdAt: string; updatedAt: string;
}
export const ordersPaymentsService = {
  overview() { return api.get<{ success: boolean; orders: OrderSummary[]; payments: PaymentTransactionSummary[] }>("/orders-payments/overview"); },
  subscriptions() { return api.get<{ success: boolean; subscriptions: SubscriptionSummary[] }>("/orders-payments/subscriptions"); },
  getSettings() { return api.get<{ success: boolean; settings: PaymentSettings }>("/orders-payments/settings"); },
  updateSettings(input: { currency?: string; pinEnabled?: boolean; biometricEnabled?: boolean }) {
    return api.patch<{ success: boolean; settings: PaymentSettings }>("/orders-payments/settings", input);
  },
  starsActivity() { return api.get<{ success:boolean; balance:number; activity:StarTransaction[] }>("/orders-payments/stars/activity"); },
  starsCatalog(countryCode?: string) { return api.get<{ success:boolean; countries:StarCountry[]; packages:StarPackage[] }>(countryCode ? "/orders-payments/stars/catalog?country="+encodeURIComponent(countryCode) : "/orders-payments/stars/catalog"); },
  verifyPayment(reference:string) { return api.get<{success:boolean;payment:{status:string;transactionId:string;redomTransactionId?:string|null;amountMinor:string;currency:string;purpose:string}}>("/payments/verify/"+encodeURIComponent(reference)); },
  sendStars(recipientUserId:string,stars:number) { return api.post<{success:boolean;starsSent:number;creatorEligible:boolean;rewardValueUsd:number;creatorShareUsd:number;redomGrossUsd:number;senderBalance:number;recipientBalance:number;reference:string}>("/orders-payments/stars/send",{recipientUserId,stars}); },
  creatorEarnings() { return api.get<{success:boolean;sharePercent:number;starRewardValueUsd:number;months:Array<{earningMonth:string;stars:number;rewardValueUsd:number;creatorShareUsd:number;status:string}>}>("/orders-payments/stars/creator/earnings"); },
  initializeStars(input:{packageKey:string;countryCode:string;email:string;pin?:string;paymentMethodId?:string;address?:{countryCode:string;countryName:string;fullName:string;addressLine1:string;addressLine2?:string|null;city:string;state?:string|null;postalCode?:string|null;mapboxPlaceId?:string|null;latitude?:number|null;longitude?:number|null}}) {
    return api.post<{success:boolean;mode:string;checkoutUrl:string|null;accessCode:string|null;reference:string;redomTransactionId:string;status?:string}>("/orders-payments/stars/initialize",input);
  },
  paymentMethods() { return api.get<{success:boolean;methods:SavedPaymentMethod[]}>("/orders-payments/payment-methods"); },
  removePaymentMethod(id:string,password:string) { return api.delete<{success:boolean}>("/orders-payments/payment-methods/"+encodeURIComponent(id),{password}); },
  paymentAddresses() { return api.get<{success:boolean;addresses:PaymentAddress[]}>("/orders-payments/payment-addresses"); },
  addressSearch(q:string) { return api.get<{success:boolean;suggestions:Array<{id:string;placeName:string;longitude:number|null;latitude:number|null;context:any[]}>}>("/orders-payments/address/search?q="+encodeURIComponent(q)); },
  setPaymentPin(pin:string,currentPin?:string) { return api.post<{success:boolean;pinEnabled:boolean}>("/orders-payments/payment-security/pin",{pin,currentPin}); },
  disablePaymentPin(password:string) { return api.delete<{success:boolean;pinEnabled:boolean}>("/orders-payments/payment-security/pin",{password}); },
};
