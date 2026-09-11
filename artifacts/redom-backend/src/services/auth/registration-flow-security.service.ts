import { and, eq, gt } from "drizzle-orm";

import { db } from "../../database/db";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";
import { checkIP, type IPAPIResult } from "../../lib/ipapi";

export type RegistrationFlowNetworkSecurity = {
  ip: string | null;
  connection: string | null;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  organization: string | null;
  companyType: string | null;
  asn: number | null;
  datacenter: string | null;
  datacenterDomain: string | null;
  datacenterNetwork: string | null;
  vpnService: string | null;
  egressService: string | null;
  egressProvider: string | null;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  bot: boolean;
  abuser: boolean;
  mobile: boolean;
  satellite: boolean;
  bogon: boolean;
  fraudScore: number;
  fraudLevel: "low" | "moderate" | "high" | "critical";
  companyAbuserScore: number;
  asnAbuserScore: number;
  securitySignals: string[];
  ipapi: {
    ip: string | null;
    rir: string | null;
    isBogon: boolean;
    isMobile: boolean;
    isSatellite: boolean;
    isCrawler: boolean;
    isDatacenter: boolean;
    isTor: boolean;
    isProxy: boolean;
    isVpn: boolean;
    isAbuser: boolean;
    datacenter: Record<string, unknown> | null;
    company: Record<string, unknown> | null;
    abuse: Record<string, unknown> | null;
    asn: Record<string, unknown> | null;
    location: Record<string, unknown> | null;
  };
  consentedAt: string | null;
};

type CachedInspection = { ip: string; expiresAt: number; security: RegistrationFlowNetworkSecurity };
const INSPECTION_CACHE_MS = 2 * 60 * 1000;
const inspectionCache = new Map<string, CachedInspection>();

function scorePercent(value?: string | null): number {
  if (!value) return 0;
  const match = value.match(/\d+(?:\.\d+)?/);
  if (!match) return 0;
  const raw = Number(match[0]);
  if (!Number.isFinite(raw)) return 0;
  return Math.min(100, Math.max(0, raw <= 1 ? raw * 100 : raw));
}

function connectionType(result: IPAPIResult) {
  if (result.is_tor) return "Tor";
  if (result.is_vpn) return "VPN";
  if (result.is_proxy) return "Proxy";
  if (result.is_datacenter) return "Datacenter / Hosting";
  if (result.is_mobile) return "Mobile";
  if (result.is_satellite) return "Satellite";
  if (result.egress_service?.type) return result.egress_service.type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return result.company?.type?.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || result.asn?.type?.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Residential / ISP";
}

function calculateFraudScore(result: IPAPIResult, companyAbuserScore: number, asnAbuserScore: number) {
  const signals: Array<[string, number]> = [];
  const add = (name: string, weight: number) => signals.push([name, weight]);
  if (result.is_bogon) add("Bogon / reserved address", 95);
  if (result.is_tor) add("Tor", 90);
  if (result.is_proxy) add("Proxy", 75);
  if (result.is_vpn) add("VPN", 70);
  if (result.is_datacenter) add("Datacenter / hosting", 40);
  if (result.is_crawler) add("Automated traffic", 50);
  if (result.is_abuser) add("Abuse flag", 55);
  if (result.egress_service?.type) add("Egress service", 35);
  if (result.is_satellite) add("Satellite network", 5);
  if (companyAbuserScore >= 40) add(`Company abuse score ${Math.round(companyAbuserScore)}%`, Math.min(70, companyAbuserScore));
  if (asnAbuserScore >= 40) add(`ASN abuse score ${Math.round(asnAbuserScore)}%`, Math.min(70, asnAbuserScore));

  let combined = Math.max(companyAbuserScore, asnAbuserScore);
  for (const [, weight] of signals) combined = 100 - ((100 - combined) * (100 - weight)) / 100;
  const score = Math.round(Math.min(100, combined));
  const fraudLevel = score >= 85 ? "critical" : score >= 60 ? "high" : score >= 30 ? "moderate" : "low";
  return { score, fraudLevel, signals: signals.map(([name]) => name) } as const;
}

function sanitizeIpapi(result: IPAPIResult) {
  return {
    ip: result.ip ?? null,
    rir: result.rir ?? null,
    isBogon: result.is_bogon === true,
    isMobile: result.is_mobile === true,
    isSatellite: result.is_satellite === true,
    isCrawler: Boolean(result.is_crawler),
    isDatacenter: result.is_datacenter === true,
    isTor: result.is_tor === true,
    isProxy: result.is_proxy === true,
    isVpn: result.is_vpn === true,
    isAbuser: result.is_abuser === true,
    datacenter: result.datacenter ? { ...result.datacenter } : null,
    company: result.company ? { ...result.company } : null,
    abuse: result.abuse ? { ...result.abuse } : null,
    asn: result.asn ? { ...result.asn } : null,
    location: result.location ? { ...result.location } : null,
  };
}

function buildSecurity(result: IPAPIResult): RegistrationFlowNetworkSecurity {
  const companyAbuserScore = scorePercent(result.company?.abuser_score);
  const asnAbuserScore = scorePercent(result.asn?.abuser_score);
  const fraud = calculateFraudScore(result, companyAbuserScore, asnAbuserScore);
  return {
    ip: result.ip ?? null,
    connection: connectionType(result),
    country: result.location?.country ?? null,
    countryCode: result.location?.country_code?.toUpperCase() ?? result.country_code?.toUpperCase() ?? null,
    region: result.location?.state ?? null,
    city: result.location?.city ?? null,
    timezone: result.location?.timezone ?? null,
    organization: result.company?.name ?? result.asn?.org ?? null,
    companyType: result.company?.type ?? result.asn?.type ?? null,
    asn: result.asn?.asn ?? null,
    datacenter: result.datacenter?.datacenter ?? null,
    datacenterDomain: result.datacenter?.domain ?? null,
    datacenterNetwork: result.datacenter?.network ?? null,
    vpnService: result.vpn?.service ?? null,
    egressService: result.egress_service?.type ?? null,
    egressProvider: result.egress_service?.provider ?? null,
    proxy: result.is_proxy === true,
    vpn: result.is_vpn === true,
    tor: result.is_tor === true,
    bot: Boolean(result.is_crawler),
    abuser: result.is_abuser === true,
    mobile: result.is_mobile === true,
    satellite: result.is_satellite === true,
    bogon: result.is_bogon === true,
    fraudScore: fraud.score,
    fraudLevel: fraud.fraudLevel,
    companyAbuserScore,
    asnAbuserScore,
    securitySignals: fraud.signals,
    ipapi: sanitizeIpapi(result),
    consentedAt: null,
  };
}

export class RegistrationFlowSecurityService {
  private async reservation(params: { reservationId: string; flowId: string; deviceId?: string }) {
    const reservation = await db.query.registrationFlowReservations.findFirst({
      where: and(eq(registrationFlowReservations.id, params.reservationId), eq(registrationFlowReservations.flowId, params.flowId), eq(registrationFlowReservations.status, "active"), gt(registrationFlowReservations.expiresAt, new Date())),
    });
    if (!reservation) throw new Error("Registration Flow ID is invalid or expired.");
    if (reservation.deviceId && reservation.deviceId !== params.deviceId) throw new Error("Registration Flow ID is not valid for this device.");
    return reservation;
  }

  async inspect(params: { reservationId: string; flowId: string; deviceId?: string; ip: string }) {
    const reservation = await this.reservation(params);
    const normalizedIp = params.ip.trim();
    if (!normalizedIp) throw new Error("A public IP address is required for the network security check.");
    const cached = inspectionCache.get(reservation.id);
    if (cached && cached.expiresAt > Date.now() && cached.ip === normalizedIp) return { success: true, flowId: reservation.flowId, reservationId: reservation.id, security: cached.security };
    const result = await checkIP(normalizedIp);
    const security = buildSecurity(result);
    inspectionCache.set(reservation.id, { ip: normalizedIp, expiresAt: Date.now() + INSPECTION_CACHE_MS, security });
    return { success: true, flowId: reservation.flowId, reservationId: reservation.id, security };
  }

  async capture(params: { reservationId: string; flowId: string; deviceId?: string; ip: string }) {
    const reservation = await this.reservation(params);
    const inspected = await this.inspect(params);
    const capturedAt = new Date().toISOString();
    const security = { ...inspected.security, consentedAt: null };
    const existingMemory = (reservation.memory ?? {}) as Record<string, unknown>;
    const memory = {
      ...existingMemory,
      networkSecurity: {
        ...security,
        consented: false,
        capturedAt,
        dataPurpose: "abuse_prevention_and_registration_security",
        dataSource: "IPAPI",
      },
    };
    const [updated] = await db.update(registrationFlowReservations).set({
      memory: memory as never,
      ipFraudScore: security.fraudScore,
      ipProxy: security.proxy,
      ipVpn: security.vpn,
      ipTor: security.tor,
      ipBotStatus: security.bot,
      ipCountryCode: security.countryCode,
    }).where(and(eq(registrationFlowReservations.id, reservation.id), eq(registrationFlowReservations.flowId, params.flowId), eq(registrationFlowReservations.status, "active"), gt(registrationFlowReservations.expiresAt, new Date()))).returning();
    if (!updated) throw new Error("Unable to save network security details to this registration Flow ID.");
    return { success: true, flowId: updated.flowId, reservationId: updated.id, security, capturedAt };
  }

  async consent(params: { reservationId: string; flowId: string; deviceId?: string; ip: string }) {
    const reservation = await this.reservation(params);
    const inspected = await this.inspect(params);
    const consentedAt = new Date().toISOString();
    const security = { ...inspected.security, consentedAt };
    const existingMemory = (reservation.memory ?? {}) as Record<string, unknown>;
    const memory = {
      ...existingMemory,
      networkSecurity: {
        ...security,
        consented: true,
        consentedAt,
        dataPurpose: "abuse_prevention_and_registration_security",
        dataSource: "IPAPI",
      },
    };
    const [updated] = await db.update(registrationFlowReservations).set({
      memory: memory as never,
      ipFraudScore: security.fraudScore,
      ipProxy: security.proxy,
      ipVpn: security.vpn,
      ipTor: security.tor,
      ipBotStatus: security.bot,
      ipCountryCode: security.countryCode,
    }).where(and(eq(registrationFlowReservations.id, reservation.id), eq(registrationFlowReservations.flowId, params.flowId), eq(registrationFlowReservations.status, "active"), gt(registrationFlowReservations.expiresAt, new Date()))).returning();
    if (!updated) throw new Error("Unable to save network security details to this registration Flow ID.");
    inspectionCache.delete(reservation.id);
    return { success: true, flowId: updated.flowId, reservationId: updated.id, security, consentedAt, screenCompleted: true };
  }
}

export const registrationFlowSecurityService = new RegistrationFlowSecurityService();
