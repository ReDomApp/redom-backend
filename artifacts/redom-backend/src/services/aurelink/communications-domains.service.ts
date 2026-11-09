import { resolveCname, resolveMx, resolveTxt } from "node:dns/promises";

export type AurelinkEmailProvider = "resend" | "brevo";
export interface AurelinkDnsRecord {
  type: string;
  name: string;
  value: string;
  ttl?: number | string;
  priority?: number;
  status?: boolean | string;
  purpose?: string;
}
export interface AurelinkDomainSnapshot {
  provider: AurelinkEmailProvider;
  providerDomainId: string;
  verified: boolean;
  authenticated: boolean;
  records: AurelinkDnsRecord[];
  raw: unknown;
}

const timeoutMs = 12000;
function apiKey(provider: AurelinkEmailProvider): string {
  const value = provider === "resend"
    ? process.env.AURELINK_RESEND_API_KEY || process.env.RESEND_API_KEY
    : process.env.AURELINK_BREVO_API_KEY || process.env.BREVO_API_KEY;
  if (!value) throw new Error(`${provider} domain management is not configured.`);
  return value;
}
async function request(provider: AurelinkEmailProvider, path: string, method = "GET", body?: unknown): Promise<any> {
  const key = apiKey(provider);
  const base = provider === "resend" ? "https://api.resend.com" : "https://api.brevo.com/v3";
  const headers: Record<string,string> = provider === "resend"
    ? { authorization: `Bearer ${key}`, accept: "application/json" }
    : { "api-key": key, accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(base + path, {
      method, headers, signal: controller.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let parsed: any = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { message: text.slice(0, 300) }; }
    if (!response.ok) {
      const message = parsed?.message || parsed?.error?.message || parsed?.code || `HTTP ${response.status}`;
      throw new Error(`${provider} domain API: ${String(message).slice(0, 300)}`);
    }
    return parsed?.data ?? parsed;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error(`${provider} domain API timed out.`);
    throw error;
  } finally { clearTimeout(timer); }
}
function normalizeDomain(value: string): string {
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  if (domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error("Enter a valid fully qualified domain name (for example, mail.example.com).");
  }
  return domain;
}
function normalizeRecords(provider: AurelinkEmailProvider, value: any): AurelinkDnsRecord[] {
  if (provider === "brevo") {
    const dns = value?.dns_records || {};
    return Object.entries(dns).flatMap(([purpose, record]: [string, any]) => record && record.type && record.value !== undefined ? [{
      type: String(record.type).toUpperCase(),
      name: String(record.host_name || "").replace(/\.$/, ""),
      value: String(record.value),
      ...(record.priority !== undefined ? { priority: Number(record.priority) } : {}),
      status: Boolean(record.status),
      purpose,
    }] : []);
  }
  const records = Array.isArray(value?.records) ? value.records : [];
  return records.map((record: any) => ({
    type: String(record.type || record.record || "").toUpperCase(),
    name: String(record.name || "").replace(/\.$/, ""),
    value: String(record.value || ""),
    ...(record.ttl !== undefined ? { ttl: record.ttl } : {}),
    ...(record.priority !== undefined ? { priority: Number(record.priority) } : {}),
    status: record.status ?? false,
    purpose: String(record.record || record.type || "provider"),
  })).filter((record: AurelinkDnsRecord) => record.type && record.value);
}
function snapshot(provider: AurelinkEmailProvider, value: any, id?: string): AurelinkDomainSnapshot {
  const providerDomainId = String(id || value?.id || value?.domain_name || value?.domain || "");
  return {
    provider, providerDomainId,
    verified: value?.verified === true || value?.status === "verified",
    authenticated: value?.authenticated === true || value?.status === "verified",
    records: normalizeRecords(provider, value),
    raw: value,
  };
}
export async function createAurelinkProviderDomain(provider: AurelinkEmailProvider, inputDomain: string): Promise<AurelinkDomainSnapshot> {
  const domain = normalizeDomain(inputDomain);
  if (provider === "resend") {
    const created = await request(provider, "/domains", "POST", { name: domain });
    const id = String(created?.id || "");
    if (!id) throw new Error("Resend created no domain identifier.");
    const details = await request(provider, `/domains/${encodeURIComponent(id)}`);
    return snapshot(provider, details, id);
  }
  const created = await request(provider, "/senders/domains", "POST", { name: domain });
  const details = await request(provider, `/senders/domains/${encodeURIComponent(domain)}`);
  return snapshot(provider, details, String(created?.id || domain));
}
export async function getAurelinkProviderDomain(provider: AurelinkEmailProvider, providerDomainId: string, domain: string): Promise<AurelinkDomainSnapshot> {
  const value = provider === "resend"
    ? await request(provider, `/domains/${encodeURIComponent(providerDomainId)}`)
    : await request(provider, `/senders/domains/${encodeURIComponent(normalizeDomain(domain))}`);
  return snapshot(provider, value, providerDomainId);
}
export async function verifyAurelinkProviderDomain(provider: AurelinkEmailProvider, providerDomainId: string, domain: string): Promise<AurelinkDomainSnapshot> {
  if (provider === "resend") {
    await request(provider, `/domains/${encodeURIComponent(providerDomainId)}/verify`, "POST", {});
  } else {
    await request(provider, `/senders/domains/${encodeURIComponent(normalizeDomain(domain))}/authenticate`, "PUT");
  }
  return getAurelinkProviderDomain(provider, providerDomainId, domain);
}
async function resolveRecord(record: AurelinkDnsRecord, domain: string): Promise<{ found: boolean; observed: string[]; error?: string }> {
  const host = (record.name ? (record.name.endsWith(domain) ? record.name : `${record.name}.${domain}`) : domain).replace(/\.$/, "");
  try {
    if (record.type === "TXT") {
      const rows = await resolveTxt(host);
      const observed = rows.map(parts => parts.join(""));
      return { found: observed.some(value => value.replace(/\s/g, "") === record.value.replace(/\s/g, "") || value.includes(record.value)), observed };
    }
    if (record.type === "CNAME") {
      const observed = await resolveCname(host);
      return { found: observed.some(value => value.replace(/\.$/, "").toLowerCase() === record.value.replace(/\.$/, "").toLowerCase()), observed };
    }
    if (record.type === "MX") {
      const observed = await resolveMx(host);
      const target = record.value.replace(/\.$/, "").toLowerCase();
      const found = observed.some(value => value.exchange.replace(/\.$/, "").toLowerCase() === target && (record.priority === undefined || value.priority === record.priority));
      return { found, observed: observed.map(value => `${value.priority} ${value.exchange}`) };
    }
    return { found: false, observed: [], error: "DNS comparison for this record type is not implemented." };
  } catch (error) {
    return { found: false, observed: [], error: error instanceof Error ? error.message : "DNS lookup failed." };
  }
}
export async function inspectAurelinkDomainDns(domainValue: string, records: AurelinkDnsRecord[]) {
  const domain = normalizeDomain(domainValue);
  const checks = await Promise.all(records.map(async record => {
    const result = await resolveRecord(record, domain);
    return { ...record, ...result };
  }));
  return { domain, checkedAt: new Date().toISOString(), complete: checks.length > 0 && checks.every(check => check.found), records: checks };
}
