import { env } from "../../config/env";

const BASE_URL = "https://api.smspool.net";
const DEFAULT_TIMEOUT_MS = 12_000;

export type SmsPoolPayload = Record<string, unknown> | unknown[] | string | number | boolean | null;

export class SmsPoolError extends Error {
  readonly status?: number;
  readonly providerType?: string;

  constructor(message: string, options: { status?: number; providerType?: string } = {}) {
    super(message);
    this.name = "SmsPoolError";
    this.status = options.status;
    this.providerType = options.providerType;
  }
}

function apiKey(): string {
  const key = process.env.SMSPOOL_API_KEY?.trim();
  if (!key) throw new SmsPoolError("SMSPool is not configured.", { providerType: "NOT_CONFIGURED" });
  return key;
}

function record(value: SmsPoolPayload): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export class SmsPoolClient {
  constructor(private readonly timeoutMs = Number(process.env.AURELINK_SMSPOOL_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)) {}

  async post<T extends SmsPoolPayload = SmsPoolPayload>(path: string, fields: Record<string, string | number | boolean | undefined | null> = {}): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//")) throw new SmsPoolError("Invalid provider endpoint.");
    const body = new URLSearchParams();
    body.set("key", apiKey());
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) body.set(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body,
        signal: controller.signal,
      });
      const text = await response.text();
      let data: SmsPoolPayload;
      try { data = text ? JSON.parse(text) as SmsPoolPayload : null; }
      catch { throw new SmsPoolError("SMSPool returned a non-JSON response.", { status: response.status }); }

      if (!response.ok) throw new SmsPoolError(`SMSPool request failed with HTTP ${response.status}.`, { status: response.status });
      const obj = record(data);
      if (obj.success === 0 || obj.success === false) {
        const type = typeof obj.type === "string" ? obj.type : "PROVIDER_REJECTED";
        const message = typeof obj.message === "string" ? obj.message : "SMSPool rejected the request.";
        throw new SmsPoolError(message, { status: response.status, providerType: type });
      }
      return data as T;
    } catch (error) {
      if (error instanceof SmsPoolError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new SmsPoolError("SMSPool request timed out.", { providerType: "TIMEOUT" });
      }
      throw new SmsPoolError("Unable to reach SMSPool.", { providerType: "NETWORK_ERROR" });
    } finally {
      clearTimeout(timer);
    }
  }

  balance(): Promise<SmsPoolPayload> { return this.post("/request/balance"); }
  services(): Promise<SmsPoolPayload> { return this.post("/service/retrieve_all"); }
  countries(): Promise<SmsPoolPayload> { return this.post("/country/retrieve_all"); }
  pools(): Promise<SmsPoolPayload> { return this.post("/pool/retrieve_all"); }
  rentals(extendable: 0 | 1): Promise<SmsPoolPayload> { return this.post("/rental/retrieve_all", { type: extendable }); }
  rentalPricing(rentalId: string, serviceId?: string): Promise<SmsPoolPayload> { return this.post("/rental/retrieve_pricing", { rental_id: rentalId, service_id: serviceId }); }
  rentalServices(rentalId: string): Promise<SmsPoolPayload> { return this.post("/rental/retrieve_services", { rental_id: rentalId }); }
  pricing(fields: Record<string, string | number | undefined>): Promise<SmsPoolPayload> { return this.post("/request/pricing", fields); }
  stock(fields: Record<string, string | number | undefined>): Promise<SmsPoolPayload> { return this.post("/sms/stock", fields); }
  activeOrders(): Promise<SmsPoolPayload> { return this.post("/request/active"); }
  orderHistory(): Promise<SmsPoolPayload> { return this.post("/request/orders"); }
  checkSms(orderId: string): Promise<SmsPoolPayload> { return this.post("/sms/check", { orderid: orderId }); }
  cancelSms(orderId: string): Promise<SmsPoolPayload> { return this.post("/sms/cancel", { orderid: orderId }); }

  purchaseSms(input: {
    country: string;
    service: string;
    maxPrice: number;
    pool?: string;
    pricingOption?: 0 | 1;
    activationType?: "SMS" | "VOICE" | "FLASH";
    quantity?: number;
    areaCode?: string;
    exclude?: 0 | 1;
  }): Promise<SmsPoolPayload> {
    return this.post("/purchase/sms", {
      country: input.country,
      service: input.service,
      max_price: input.maxPrice,
      pool: input.pool,
      pricing_option: input.pricingOption ?? 0,
      activation_type: input.activationType ?? "SMS",
      quantity: input.quantity ?? 1,
      areacode: input.areaCode,
      exclude: input.exclude,
    });
  }

  rentalStatus(rentalId: string): Promise<SmsPoolPayload> { return this.post("/rental/retrieve_status", { rental_code: rentalId }); }
  rentalMessages(rentalId: string): Promise<SmsPoolPayload> { return this.post("/rental/retrieve_messages", { rental_code: rentalId }); }
  purchaseRental(fields: Record<string, string | number | undefined>): Promise<SmsPoolPayload> { return this.post("/purchase/rental", fields); }
  renewRental(rentalId: string, days: number): Promise<SmsPoolPayload> { return this.post("/rental/extend", { rental_code: rentalId, days }); }
  cancelRental(rentalId: string): Promise<SmsPoolPayload> { return this.post("/rental/refund", { rental_code: rentalId }); }

  carrierLookup(phoneNumber: string): Promise<SmsPoolPayload> { return this.post("/carrier/paid_lookup", { phonenumber: phoneNumber }); }
  esimPlans(country: string): Promise<SmsPoolPayload> { return this.post("/esim/plans", { country }); }
  esimPricing(): Promise<SmsPoolPayload> { return this.post("/esim/pricing"); }
  purchaseEsim(plan: number): Promise<SmsPoolPayload> { return this.post("/esim/purchase", { plan }); }
  esimProfile(transactionId?: string): Promise<SmsPoolPayload> { return this.post("/esim/profile", { transaction_id: transactionId }); }
  esimTopupPlans(transactionId: string): Promise<SmsPoolPayload> { return this.post("/esim/topup_plans", { transaction_id: transactionId }); }
  esimTopup(transactionId: string, plan: number): Promise<SmsPoolPayload> { return this.post("/esim/topup", { transaction_id: transactionId, plan }); }
  deleteEsim(transactionId: string): Promise<SmsPoolPayload> { return this.post("/esim/delete", { transaction_id: transactionId }); }
}

export const smsPoolClient = new SmsPoolClient();
