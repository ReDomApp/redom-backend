const DEFAULT_BASE_URL = "https://redom-backend.onrender.com/redom-backend/v1";
const clean = (value) => String(value ?? "").replace(/^\/+|\/+$/g, "");
const pathId = (value) => encodeURIComponent(String(value));

export class AurelinkError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "AurelinkError";
    this.status = details.status ?? 0;
    this.code = details.code ?? null;
    this.requestId = details.requestId ?? null;
    this.retryAfter = details.retryAfter ?? null;
    this.idempotencyKey = details.idempotencyKey ?? null;
    this.body = details.body ?? null;
  }
}

export class Aurelink {
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, timeout = 30000, fetch: fetchImpl = globalThis.fetch } = {}) {
    if (!apiKey || typeof apiKey !== "string") throw new TypeError("Aurelink requires an API key.");
    if (!/^aul_(test|live)_/.test(apiKey)) throw new TypeError("API key must be a valid Aurelink test or live key.");
    if (typeof fetchImpl !== "function") throw new TypeError("Aurelink requires a Fetch-compatible runtime.");
    this.apiKey = apiKey;
    this.baseUrl = clean(baseUrl);
    this.timeout = Math.max(1000, Math.min(120000, Number(timeout) || 30000));
    this.fetch = fetchImpl;
    this.status = { get: () => this.request("/aurelink/status") };
    this.services = { list: (query) => this.request("/aurelink/catalog/services", { query }) };
    this.countries = { list: (query) => this.request("/aurelink/catalog/countries", { query }) };
    this.orders = { list: (query) => this.request("/aurelink/orders", { query }) };
    this.wallet = {
      get: () => this.request("/aurelink/wallet"),
      ledger: (query) => this.request("/aurelink/wallet/ledger", { query })
    };
    this.quotes = {
      create: (input) => this.request("/aurelink/quotes", { method: "POST", body: input })
    };
    this.activations = {
      create: (input, options) => this.request("/aurelink/activations", { method: "POST", body: input, ...options, idempotent: true }),
      get: (id) => this.request(`/aurelink/activations/${pathId(id)}/status`),
      messages: (id) => this.request(`/aurelink/activations/${pathId(id)}/messages`),
      cancel: (id, options) => this.request(`/aurelink/activations/${pathId(id)}/cancel`, { method: "POST", body: {}, ...options }),
      resend: (id, options) => this.request(`/aurelink/activations/${pathId(id)}/resend`, { method: "POST", body: {}, ...options })
    };
    this.rentals = {
      catalog: (query) => this.request("/aurelink/catalog/rentals", { query }),
      quote: (input) => this.request("/aurelink/rental-quotes", { method: "POST", body: input }),
      create: (input, options) => this.request("/aurelink/rentals", { method: "POST", body: input, ...options, idempotent: true }),
      get: (id) => this.request(`/aurelink/rentals/${pathId(id)}/status`),
      messages: (id) => this.request(`/aurelink/rentals/${pathId(id)}/messages`),
      renew: (id, input = {}, options) => this.request(`/aurelink/rentals/${pathId(id)}/renew`, { method: "POST", body: input, ...options, idempotent: true }),
      cancel: (id, options) => this.request(`/aurelink/rentals/${pathId(id)}/cancel`, { method: "POST", body: {}, ...options })
    };
    this.nonVoip = {
      countries: (query) => this.request("/aurelink/nonvoip/countries", { query }),
      products: (query) => this.request("/aurelink/nonvoip/products", { query }),
      create: (input, options) => this.request("/aurelink/nonvoip/orders", { method: "POST", body: input, ...options, idempotent: true }),
      messages: (id) => this.request(`/aurelink/nonvoip/orders/${pathId(id)}/messages`),
      cancel: (id, options) => this.request(`/aurelink/nonvoip/orders/${pathId(id)}/cancel`, { method: "POST", body: {}, ...options })
    };
    this.dedicated = {
      countries: (query) => this.request("/aurelink/dedicated/countries", { query }),
      quote: (input) => this.request("/aurelink/dedicated/quote", { method: "POST", body: input }),
      create: (input, options) => this.request("/aurelink/dedicated/orders", { method: "POST", body: input, ...options, idempotent: true }),
      messages: (id) => this.request(`/aurelink/dedicated/orders/${pathId(id)}/messages`),
      setAutoRenew: (id, enabled) => this.request(`/aurelink/dedicated/orders/${pathId(id)}/auto-renew`, { method: "PATCH", body: { enabled } }),
      cancel: (id, options) => this.request(`/aurelink/dedicated/orders/${pathId(id)}/cancel`, { method: "POST", body: {}, ...options })
    };
  }

  async request(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const url = new URL(`${this.baseUrl}/${clean(path)}`);
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) value.forEach((entry) => url.searchParams.append(key, String(entry)));
      else url.searchParams.set(key, String(value));
    }
    const headers = { Accept: "application/json", Authorization: `Bearer ${this.apiKey}`, ...options.headers };
    let body;
    if (options.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(options.body); }
    let idempotencyKey = options.idempotencyKey;
    if (options.idempotent && this.apiKey.startsWith("aul_live_")) {
      idempotencyKey ||= globalThis.crypto?.randomUUID?.();
      if (!idempotencyKey) throw new AurelinkError("Provide idempotencyKey or use a runtime with crypto.randomUUID().", { code: "IDEMPOTENCY_KEY_REQUIRED" });
      headers["Idempotency-Key"] = idempotencyKey;
    } else if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await this.fetch(url, { method, headers, body, signal: controller.signal, redirect: "error" });
      const text = await response.text();
      let data = null;
      if (text) { try { data = JSON.parse(text); } catch { data = { message: text }; } }
      if (!response.ok || data?.success === false) {
        throw new AurelinkError(data?.message || `Aurelink request failed with HTTP ${response.status}.`, {
          status: response.status, code: data?.code, requestId: response.headers.get("X-Aurelink-Request-Id"),
          retryAfter: response.headers.get("Retry-After"), idempotencyKey, body: data
        });
      }
      return data;
    } catch (error) {
      if (error instanceof AurelinkError) throw error;
      throw new AurelinkError(error?.name === "AbortError" ? "Aurelink request timed out." : (error?.message || "Aurelink network request failed."), {
        code: error?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR", idempotencyKey
      });
    } finally { clearTimeout(timer); }
  }
}

export default Aurelink;
