import type { SmsMessage, SmsTransport } from "./types.js";
import { SmppTransport } from "./smsc.js";

export type SmppRouteConfig = {
  id: string;
  host: string;
  port: number;
  systemId: string;
  password: string;
  systemType?: string;
  sourceTon: number;
  sourceNpi: number;
  destTon: number;
  destNpi: number;
  enquireLinkMs: number;
  countries?: string[];
  priority?: number;
  enabled?: boolean;
};

function countryCode(phone: string): string {
  return phone.replace(/^\+/, "").slice(0, 3);
}

function parseRoutes(): SmppRouteConfig[] {
  const raw = process.env.SMPP_ROUTES_JSON;
  if (!raw) {
    if (!process.env.SMSC_HOST || !process.env.SMSC_SYSTEM_ID || !process.env.SMSC_PASSWORD) return [];
    return [{
      id: process.env.SMSC_ROUTE_ID ?? "primary",
      host: process.env.SMSC_HOST,
      port: Number(process.env.SMSC_PORT ?? 2775),
      systemId: process.env.SMSC_SYSTEM_ID,
      password: process.env.SMSC_PASSWORD,
      systemType: process.env.SMSC_SYSTEM_TYPE,
      sourceTon: Number(process.env.SMSC_SOURCE_TON ?? 5),
      sourceNpi: Number(process.env.SMSC_SOURCE_NPI ?? 0),
      destTon: Number(process.env.SMSC_DEST_TON ?? 1),
      destNpi: Number(process.env.SMSC_DEST_NPI ?? 1),
      enquireLinkMs: Number(process.env.SMSC_ENQUIRE_LINK_MS ?? 30000),
      countries: process.env.SMSC_COUNTRY_CODES?.split(",").map(x => x.trim()).filter(Boolean),
      priority: 100,
      enabled: true
    }];
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("SMPP_ROUTES_JSON must be an array");
  return parsed.map((x: any, i) => ({
    id: String(x.id ?? `route-${i + 1}`),
    host: String(x.host),
    port: Number(x.port ?? 2775),
    systemId: String(x.systemId),
    password: String(x.password),
    systemType: x.systemType ? String(x.systemType) : undefined,
    sourceTon: Number(x.sourceTon ?? 5),
    sourceNpi: Number(x.sourceNpi ?? 0),
    destTon: Number(x.destTon ?? 1),
    destNpi: Number(x.destNpi ?? 1),
    enquireLinkMs: Number(x.enquireLinkMs ?? 30000),
    countries: Array.isArray(x.countries) ? x.countries.map(String) : undefined,
    priority: Number(x.priority ?? 100),
    enabled: x.enabled !== false
  }));
}

export class SmsTransmissionLayer {
  private readonly routes: SmppRouteConfig[];
  private readonly transports = new Map<string, SmppTransport>();

  constructor(private readonly hooks: {
    onDeliveryReceipt: (receipt: any) => Promise<void>;
    onInbound: (sms: any) => Promise<void>;
  }) {
    this.routes = parseRoutes().filter(x => x.enabled !== false);
  }

  get configured(): boolean { return this.routes.length > 0; }

  routeIds(): string[] { return this.routes.map(x => x.id); }

  private candidates(message: SmsMessage, requestedRouteId?: string): SmppRouteConfig[] {
    const country = countryCode(message.to);
    return this.routes
      .filter(r => !requestedRouteId || r.id === requestedRouteId)
      .filter(r => !r.countries?.length || r.countries.includes(country))
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  private transport(route: SmppRouteConfig): SmppTransport {
    let t = this.transports.get(route.id);
    if (t) return t;
    t = new SmppTransport({
      ...route,
      onDeliveryReceipt: this.hooks.onDeliveryReceipt,
      onInbound: this.hooks.onInbound
    });
    this.transports.set(route.id, t);
    return t;
  }

  async submit(message: SmsMessage, segmentIndex: number, payload: Buffer, requestedRouteId?: string): Promise<{providerMessageId: string; routeId: string}> {
    const candidates = this.candidates(message, requestedRouteId);
    if (!candidates.length) throw new Error(requestedRouteId ? `No enabled SMS route matches routeId=${requestedRouteId}` : `No enabled SMS route matches destination ${message.to}`);

    let last: Error | undefined;
    for (const route of candidates) {
      try {
        const result = await this.transport(route).submit(message, segmentIndex, payload);
        return { ...result, routeId: route.id };
      } catch (e) {
        last = e instanceof Error ? e : new Error(String(e));
        await this.transports.get(route.id)?.close().catch(() => {});
        this.transports.delete(route.id);
      }
    }
    throw last ?? new Error("All SMS routes failed");
  }

  async close(): Promise<void> {
    await Promise.all([...this.transports.values()].map(x => x.close().catch(() => {})));
    this.transports.clear();
  }
}
