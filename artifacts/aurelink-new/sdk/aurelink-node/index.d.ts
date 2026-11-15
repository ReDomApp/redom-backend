export type AurelinkEnvironment = "test" | "live";
export interface AurelinkOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  fetch?: typeof fetch;
}
export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined | Array<string | number>>;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  idempotent?: boolean;
}
export declare class AurelinkError extends Error {
  status: number;
  code: string | null;
  requestId: string | null;
  retryAfter: string | null;
  idempotencyKey: string | null;
  body: unknown;
}
export declare class Aurelink {
  constructor(options: AurelinkOptions);
  request<T = any>(path: string, options?: RequestOptions): Promise<T>;
  status: { get(): Promise<any> };
  services: { list(query?: Record<string, unknown>): Promise<any> };
  countries: { list(query?: Record<string, unknown>): Promise<any> };
  orders: { list(query?: Record<string, unknown>): Promise<any> };
  wallet: { get(): Promise<any>; ledger(query?: Record<string, unknown>): Promise<any> };
  quotes: { create(input: Record<string, unknown>): Promise<any> };
  activations: {
    create(input: Record<string, unknown>, options?: RequestOptions): Promise<any>;
    get(id: string): Promise<any>;
    messages(id: string): Promise<any>;
    cancel(id: string, options?: RequestOptions): Promise<any>;
    resend(id: string, options?: RequestOptions): Promise<any>;
  };
  rentals: {
    catalog(query?: Record<string, unknown>): Promise<any>;
    quote(input: Record<string, unknown>): Promise<any>;
    create(input: Record<string, unknown>, options?: RequestOptions): Promise<any>;
    get(id: string): Promise<any>;
    messages(id: string): Promise<any>;
    renew(id: string, input?: Record<string, unknown>, options?: RequestOptions): Promise<any>;
    cancel(id: string, options?: RequestOptions): Promise<any>;
  };
  nonVoip: {
    countries(query?: Record<string, unknown>): Promise<any>;
    products(query?: Record<string, unknown>): Promise<any>;
    create(input: Record<string, unknown>, options?: RequestOptions): Promise<any>;
    messages(id: string): Promise<any>;
    cancel(id: string, options?: RequestOptions): Promise<any>;
  };
  dedicated: {
    countries(query?: Record<string, unknown>): Promise<any>;
    quote(input: Record<string, unknown>): Promise<any>;
    create(input: Record<string, unknown>, options?: RequestOptions): Promise<any>;
    messages(id: string): Promise<any>;
    setAutoRenew(id: string, enabled: boolean): Promise<any>;
    cancel(id: string, options?: RequestOptions): Promise<any>;
  };
}
export declare function verifyWebhookSignature(options: { payload: string | Uint8Array; signature: string; timestamp: string | number; secret: string; toleranceSeconds?: number; now?: number }): boolean;
export default Aurelink;
