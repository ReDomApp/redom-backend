import { and, eq } from "drizzle-orm";

import { db } from "../../database/db";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";
import { checkIP } from "../../lib/ipapi";

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
  fraudScore: number;
};

function connectionType(result: Awaited<ReturnType<typeof checkIP>>) {
  if (result.is_tor) return "Tor";
  if (result.is_vpn) return "VPN";
  if (result.is_proxy) return "Proxy";
  if (result.is_datacenter) return "Datacenter / Hosting";
  if (result.is_mobile) return "Mobile";
  if (result.is_satellite) return "Satellite";
  if (result.egress_service?.type) {
    return result.egress_service.type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return result.company?.type ? result.company.type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Residential / ISP";
}

export class RegistrationFlowSecurityService {
  async inspect(params: { reservationId: string; flowId: string; deviceId?: string; ip: string }) {
    const reservation = await db.query.registrationFlowReservations.findFirst({
      where: and(
        eq(registrationFlowReservations.id, params.reservationId),
        eq(registrationFlowReservations.flowId, params.flowId),
      ),
    });

    if (!reservation) throw new Error("Registration Flow ID is invalid.");
    if (reservation.deviceId && reservation.deviceId !== params.deviceId) {
      throw new Error("Registration Flow ID is not valid for this device.");
    }

    const existingMemory = (reservation.memory ?? {}) as Record<string, unknown>;
    const existingNetwork = (existingMemory.networkSecurity ?? {}) as Record<string, unknown>;
    const cachedIp = typeof existingNetwork.ip === "string" ? existingNetwork.ip : null;

    // Flow creation performs the authoritative IPAPI lookup once. Later Screen 4
    // security reads reuse that same server-owned result instead of consuming
    // another IPAPI lookup or producing a second inconsistent verdict.
    if (cachedIp && cachedIp === params.ip && typeof existingNetwork.fraudScore === "number") {
      return {
        success: true,
        flowId: reservation.flowId,
        reservationId: reservation.id,
        security: existingNetwork as RegistrationFlowNetworkSecurity,
      };
    }

    const result = await checkIP(params.ip);
    const security: RegistrationFlowNetworkSecurity = {
      ip: result.ip ?? params.ip,
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
      vpnService: result.vpn?.service ?? null,
      egressService: result.egress_service?.type ?? null,
      egressProvider: result.egress_service?.provider ?? null,
      proxy: result.is_proxy === true,
      vpn: result.is_vpn === true,
      tor: result.is_tor === true,
      bot: result.is_crawler === true || result.bot_status === true,
      abuser: result.is_abuser === true || result.recent_abuse === true,
      mobile: result.is_mobile === true,
      satellite: result.is_satellite === true,
      fraudScore: Number(result.fraud_score ?? 0),
    };

    const memory = {
      ...existingMemory,
      networkSecurity: {
        ...existingNetwork,
        ...security,
      },
    };

    const [updated] = await db
      .update(registrationFlowReservations)
      .set({ memory })
      .where(
        and(
          eq(registrationFlowReservations.id, reservation.id),
          eq(registrationFlowReservations.flowId, params.flowId),
        ),
      )
      .returning();

    if (!updated) throw new Error("Unable to save IP security details to this registration Flow ID.");

    return {
      success: true,
      flowId: updated.flowId,
      reservationId: updated.id,
      security,
    };
  }
}

export const registrationFlowSecurityService = new RegistrationFlowSecurityService();
