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
      name: String(record.host_name || "").replace(/\.$/, "") === "@" ? "" : String(record.host_name || "").replace(/\.$/, ""),
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
  const records = normalizeRecords(provider, value);
  return {
    provider, providerDomainId,
    verified: value?.verified === true || value?.status === "verified",
    authenticated: value?.authenticated === true || value?.status === "verified",
    records,
    raw: value,
  };
}
export async function createAurelinkProviderDomain(provider: AurelinkEmailProvider, inputDomain: string): Promise<AurelinkDomainSnapshot> {
  const domain = normalizeDomain(inputDomain);
  const listed = await request(provider, provider === "resend" ? "/domains" : "/senders/domains");
  const entries = provider === "resend"
    ? (Array.isArray(listed) ? listed : Array.isArray(listed?.data) ? listed.data : [])
    : (Array.isArray(listed?.domains) ? listed.domains : []);
  const existing = entries.find((item:any) => String(item.name || item.domain_name || item.domain || "").toLowerCase() === domain);
  if (existing) {
    if (provider === "resend") {
      const id = String(existing.id || "");
      if (!id) throw new Error("Existing Resend domain has no provider identifier.");
      const details = await request(provider, `/domains/${encodeURIComponent(id)}`);
      return snapshot(provider, details, id);
    }
    const details = await request(provider, `/senders/domains/${encodeURIComponent(domain)}`);
    return snapshot(provider, details, String(existing.id || domain));
  }
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
export async function updateAurelinkResendDomainTracking(providerDomainId:string,settings:{openTracking?:boolean;clickTracking?:boolean}){
  const body:any={};
  if(typeof settings.openTracking==="boolean")body.open_tracking=settings.openTracking;
  if(typeof settings.clickTracking==="boolean")body.click_tracking=settings.clickTracking;
  if(!Object.keys(body).length)throw new Error("Specify openTracking and/or clickTracking.");
  return request("resend",`/domains/${encodeURIComponent(providerDomainId)}`,"PATCH",body);
}
export async function verifyAurelinkProviderDomain(provider: AurelinkEmailProvider, providerDomainId: string, domain: string): Promise<AurelinkDomainSnapshot> {
  if (provider === "resend") {
    await request(provider, `/domains/${encodeURIComponent(providerDomainId)}/verify`, "POST", {});
  } else {
    await request(provider, `/senders/domains/${encodeURIComponent(normalizeDomain(domain))}/authenticate`, "PUT");
  }
  return getAurelinkProviderDomain(provider, providerDomainId, domain);
}
function providerRecordHostname(recordName: string, domain: string): string {
  const name=String(recordName||"").trim().replace(/\.$/,"").toLowerCase();
  const normalized=domain.toLowerCase();
  if(!name||name==="@")return normalized;
  if(name===normalized||name.endsWith("."+normalized))return name;
  const labels=normalized.split(".");
  const parent=labels.length>2?labels.slice(1).join("."):"";
  if(parent&&(name===labels[0]||name.endsWith("."+labels[0])))return name+"."+parent;
  return name+"."+normalized;
}
async function resolveRecord(record: AurelinkDnsRecord, domain: string): Promise<{ found: boolean; observed: string[]; error?: string }> {
  const host = providerRecordHostname(record.name,domain);
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

export async function configureAurelinkBrevoTransactionalWebhook(urlValue:string,secret:string){
  const url=new URL(urlValue);
  if(url.protocol!=="https:"||url.username||url.password||url.hash)throw new Error("Brevo webhook URL must be public HTTPS without credentials or fragments.");
  if(!secret||secret.length<24)throw new Error("AURELINK_BREVO_WEBHOOK_SECRET must be configured before registering the webhook.");
  const events=["request","delivered","opened","click","softBounce","hardBounce","blocked","spam","invalid","deferred","unsubscribed"];
  const payload={url:url.toString(),description:"Aurelink transactional email and SMTP delivery events",type:"transactional",channel:"email",events,headers:[{name:"Authorization",value:"Bearer "+secret}]};
  const listing=await request("brevo","/webhooks?limit=50&offset=0");
  const rows=Array.isArray(listing?.webhooks)?listing.webhooks:Array.isArray(listing?.data)?listing.data:Array.isArray(listing)?listing:[];
  const existing=rows.find((item:any)=>String(item.url||"")===url.toString()&&String(item.type||"transactional")==="transactional");
  if(existing?.id){
    await request("brevo","/webhooks/"+encodeURIComponent(String(existing.id)),"PUT",payload);
    return {provider:"brevo",webhookId:String(existing.id),action:"updated",url:url.toString(),events};
  }
  const created=await request("brevo","/webhooks","POST",payload);
  if(!created?.id)throw new Error("Brevo did not return a webhook identifier.");
  return {provider:"brevo",webhookId:String(created.id),action:"created",url:url.toString(),events};
}
export async function createAurelinkProviderEmailSender(email:string,name:string):Promise<{providerSenderId:string;active:boolean;raw:unknown}>{
  const result=await request("brevo","/senders","POST",{email,name});
  return {providerSenderId:String(result?.id||""),active:false,raw:result};
}
export async function getAurelinkProviderEmailSender(email:string,domain:string):Promise<{providerSenderId:string;active:boolean;raw:unknown}>{
  const result=await request("brevo",`/senders?domain=${encodeURIComponent(domain)}`);
  const senders=Array.isArray(result?.senders)?result.senders:[];
  const match=senders.find((sender:any)=>String(sender.email||"").toLowerCase()===email.toLowerCase());
  return {providerSenderId:String(match?.id||""),active:match?.active===true,raw:match||null};
}

export async function inspectAurelinkDomainDns(domainValue: string, records: AurelinkDnsRecord[]) {
  const domain = normalizeDomain(domainValue);
  const checks = await Promise.all(records.map(async record => {
    const result = await resolveRecord(record, domain);
    return { ...record, ...result };
  }));
  return { domain, checkedAt: new Date().toISOString(), complete: checks.length > 0 && checks.every(check => check.found), records: checks };
}
