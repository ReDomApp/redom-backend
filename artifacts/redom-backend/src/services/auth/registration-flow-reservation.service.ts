import { randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, lte } from "drizzle-orm";

import { db } from "../../database/db";
import { registrationChallenges } from "../../database/registration-challenges.schema";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";
import { checkIP, checkPhone } from "../../lib/ipqs";
import { logger } from "../../lib/logger";

const TTL_MS = 30 * 60 * 1000;
const MIN_LENGTH = 6;
const MAX_LENGTH = 16;
const MAX_NAME_LENGTH = 100;
const NAME_PATTERN = /^[\p{L}][\p{L}\s.'-]*$/u;
const MIN_BIRTH_YEAR = 1920;
const MAX_BIRTH_YEAR = 2018;

function generateNumericFlowId() {
  const length = randomInt(MIN_LENGTH, MAX_LENGTH + 1);
  const bytes = randomBytes(length);
  let value = "";
  for (let i = 0; i < length; i += 1) {
    let byte = bytes[i]!;
    while (byte >= 250) byte = randomBytes(1)[0]!;
    value += String(byte % 10);
  }
  return value;
}

function validateName(value: string, field: "First name" | "Last name") {
  const normalized = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (normalized.length < 3) throw new Error(`${field} must be at least 3 characters.`);
  if (normalized.length > MAX_NAME_LENGTH) throw new Error(`${field} is too long.`);
  if (!NAME_PATTERN.test(normalized)) throw new Error(`${field} can contain letters, spaces, periods, apostrophes, and hyphens only.`);
  if (!/\p{L}/u.test(normalized)) throw new Error(`${field} must contain letters.`);
  return normalized;
}

function getAge(dateOfBirth: string, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) throw new Error("Please enter a valid date of birth.");
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  if (year < MIN_BIRTH_YEAR || year > MAX_BIRTH_YEAR) throw new Error("Your birthday must be between 1920 and 2018.");
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error("Please enter a valid date of birth.");
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (date > today) throw new Error("Your date of birth cannot be in the future.");
  let age = now.getUTCFullYear() - year;
  const birthdayThisYear = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day));
  if (today < birthdayThisYear) age -= 1;
  if (age < 1) throw new Error("You must be at least 1 year old to continue.");
  return age;
}

function normalizeCountryCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeLineType(value?: string | null) {
  return value?.trim().toUpperCase() || null;
}

function phoneLookupReason(ipqs: Awaited<ReturnType<typeof checkPhone>>) {
  if (ipqs.valid === false) return ipqs.message || "This phone number is invalid or does not exist.";
  if (ipqs.active === false) return "This phone number is not currently active.";
  if (ipqs.VOIP === true || normalizeLineType(ipqs.line_type) === "VOIP") return "This phone number appears to be a VoIP number.";
  if (ipqs.fraud_score >= 50) return `This phone number has a fraud risk score of ${ipqs.fraud_score}%.`;
  return ipqs.message || "This phone number could not be verified.";
}

export class RegistrationFlowReservationService {
  private async purgeExpired() {
    try { await db.delete(registrationFlowReservations).where(lte(registrationFlowReservations.expiresAt, new Date())); }
    catch (error) { logger.warn({ error }, "Unable to purge expired registration Flow reservations; continuing"); }
  }

  private async getActiveReservation(params: { reservationId: string; flowId: string; deviceId?: string }) {
    await this.purgeExpired();
    const reservation = await db.query.registrationFlowReservations.findFirst({
      where: and(
        eq(registrationFlowReservations.id, params.reservationId),
        eq(registrationFlowReservations.flowId, params.flowId),
        eq(registrationFlowReservations.status, "active"),
        gt(registrationFlowReservations.expiresAt, new Date()),
      ),
    });
    if (!reservation) throw new Error("Registration Flow ID is invalid or expired.");
    if (reservation.deviceId && reservation.deviceId !== params.deviceId) throw new Error("Registration Flow ID is not valid for this device.");
    return reservation;
  }

  async reserve(deviceId?: string) {
    await this.purgeExpired();
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const flowId = generateNumericFlowId(); const now = new Date();
      const existingReservation = await db.query.registrationFlowReservations.findFirst({ where: eq(registrationFlowReservations.flowId, flowId) });
      if (existingReservation) continue;
      const existingChallenge = await db.query.registrationChallenges.findFirst({ where: and(eq(registrationChallenges.flowId, flowId), gt(registrationChallenges.expiresAt, now)) });
      if (existingChallenge) continue;
      const [reservation] = await db.insert(registrationFlowReservations).values({ flowId, deviceId, expiresAt: new Date(now.getTime() + TTL_MS), createdAt: now }).returning();
      if (!reservation) throw new Error("Unable to allocate a registration Flow ID.");
      return { success: true, reservationId: reservation.id, flowId: reservation.flowId, expiresAt: reservation.expiresAt.toISOString() };
    }
    throw new Error("Unable to allocate a unique registration Flow ID.");
  }

  async saveName(params: { reservationId: string; flowId: string; deviceId?: string; firstName: string; lastName: string }) {
    const reservation = await this.getActiveReservation(params);
    const firstName = validateName(params.firstName, "First name"); const lastName = validateName(params.lastName, "Last name");
    const [updated] = await db.update(registrationFlowReservations).set({ firstName, lastName }).where(and(eq(registrationFlowReservations.id, reservation.id), eq(registrationFlowReservations.flowId, params.flowId), eq(registrationFlowReservations.status, "active"), gt(registrationFlowReservations.expiresAt, new Date()))).returning();
    if (!updated) throw new Error("Unable to save your name to this registration flow.");
    return { success: true, reservationId: updated.id, flowId: updated.flowId, expiresAt: updated.expiresAt.toISOString() };
  }

  async saveBirthday(params: { reservationId: string; flowId: string; deviceId?: string; dateOfBirth: string }) {
    const reservation = await this.getActiveReservation(params);
    if (!reservation.firstName || !reservation.lastName) throw new Error("Your name must be saved before your birthday.");
    const age = getAge(params.dateOfBirth); const ageBand = age <= 12 ? "underage" : age <= 16 ? "teen" : "adult"; const status = age <= 12 ? "completed" : "active";
    const [updated] = await db.update(registrationFlowReservations).set({ dateOfBirth: params.dateOfBirth, status }).where(and(eq(registrationFlowReservations.id, reservation.id), eq(registrationFlowReservations.flowId, params.flowId), eq(registrationFlowReservations.status, "active"), gt(registrationFlowReservations.expiresAt, new Date()))).returning();
    if (!updated) throw new Error("Unable to save your birthday to this registration flow.");
    return { success: true, reservationId: updated.id, flowId: updated.flowId, expiresAt: updated.expiresAt.toISOString(), age, ageBand, flowStatus: updated.status };
  }

  async saveGender(params: { reservationId: string; flowId: string; deviceId?: string; gender: "female" | "male" | "custom"; pronouns?: "She / Her" | "He / Him" | "They / Them" | "Prefer not to say" }) {
    const reservation = await this.getActiveReservation(params);
    if (!reservation.firstName || !reservation.lastName || !reservation.dateOfBirth) throw new Error("Your name and birthday must be saved before your gender.");
    if (params.gender === "custom" && !params.pronouns) throw new Error("Please choose your pronouns.");
    const [updated] = await db.update(registrationFlowReservations).set({ gender: params.gender, pronouns: params.gender === "custom" ? params.pronouns : undefined }).where(and(eq(registrationFlowReservations.id, reservation.id), eq(registrationFlowReservations.flowId, params.flowId), eq(registrationFlowReservations.status, "active"), gt(registrationFlowReservations.expiresAt, new Date()))).returning();
    if (!updated) throw new Error("Unable to save your gender to this registration flow.");
    return { success: true, reservationId: updated.id, flowId: updated.flowId, expiresAt: updated.expiresAt.toISOString(), gender: updated.gender, pronouns: updated.pronouns };
  }

  async detectPhoneCountry(params: { reservationId: string; flowId: string; deviceId?: string; ip: string; deviceRegion?: string; timeZone?: string }) {
    await this.getActiveReservation(params);
    let countryCode: string | undefined;
    try {
      const ipqs = await checkIP(params.ip);
      countryCode = ipqs.success ? ipqs.country_code?.toUpperCase() : undefined;
    } catch (error) {
      logger.warn({ error }, "IPQS country detection failed; using device estimate");
    }
    const fallback = params.deviceRegion?.toUpperCase();
    return {
      success: true,
      countryCode: countryCode && /^[A-Z]{2}$/.test(countryCode) ? countryCode : fallback && /^[A-Z]{2}$/.test(fallback) ? fallback : null,
      source: countryCode ? "ipqs" : fallback ? "device" : "unknown",
      timeZone: params.timeZone ?? null,
    } as const;
  }

  async savePhone(params: { reservationId: string; flowId: string; deviceId?: string; phoneNumber: string; countryCode: string; deviceRegion?: string; timeZone?: string; ip: string }) {
    const reservation = await this.getActiveReservation(params);
    if (!reservation.firstName || !reservation.lastName || !reservation.dateOfBirth || !reservation.gender) throw new Error("Your name, birthday, and gender must be saved before your phone number.");

    const selectedCountry = normalizeCountryCode(params.countryCode);
    if (!/^[A-Z]{2}$/.test(selectedCountry)) throw new Error("The selected country is invalid.");

    let ipqsIp: Awaited<ReturnType<typeof checkIP>>;
    try {
      ipqsIp = await checkIP(params.ip);
    } catch (error) {
      logger.error({ error }, "IPQS IP security lookup failed during registration phone verification");
      throw new Error("We could not complete the security check for this registration. Please try again.");
    }
    if (!ipqsIp.success) throw new Error(ipqsIp.message || "We could not complete the security check for this registration. Please try again.");

    let ipqs: Awaited<ReturnType<typeof checkPhone>>;
    try {
      ipqs = await checkPhone(params.phoneNumber, { countryCode: selectedCountry });
    } catch (error) {
      logger.error({ error }, "IPQS phone lookup failed during registration");
      throw new Error("We could not verify this phone number right now. Please try again.");
    }
    if (!ipqs.success) throw new Error(phoneLookupReason(ipqs));

    const fraudScore = Number(ipqs.fraud_score ?? 0);
    const returnedCountry = normalizeCountryCode(ipqs.country || ipqs.country_code || "");
    const lineType = ipqs.line_type?.trim() || null;
    const voip = ipqs.VOIP === true || normalizeLineType(lineType) === "VOIP";
    const lookupComplete = true;

    if (ipqs.valid === false) throw new Error("This phone number is invalid or does not exist. Please enter another number or sign up using email.");
    if (ipqs.active === false) throw new Error("This phone number is not currently active. Please enter another number or sign up using email.");
    if (voip) throw new Error("This phone number cannot be used because it appears to be a VoIP number. Please enter another number or sign up using email.");
    if (fraudScore >= 50) throw new Error(`This phone number cannot be used because its fraud risk score is ${fraudScore}%. Please enter another number or sign up using email.`);
    if (ipqs.accurate_country_code === false || (returnedCountry && returnedCountry !== selectedCountry)) throw new Error("The phone number country does not match the selected country code. Please check the country and phone number.");

    const [updated] = await db.update(registrationFlowReservations).set({ phoneNumber: ipqs.formatted || params.phoneNumber, phoneCountryCode: selectedCountry }).where(and(eq(registrationFlowReservations.id, reservation.id), eq(registrationFlowReservations.flowId, params.flowId), eq(registrationFlowReservations.status, "active"), gt(registrationFlowReservations.expiresAt, new Date()))).returning();
    if (!updated) throw new Error("Unable to save your phone number to this registration flow.");

    return {
      success: true,
      reservationId: updated.id,
      flowId: updated.flowId,
      expiresAt: updated.expiresAt.toISOString(),
      phoneNumber: updated.phoneNumber,
      countryCode: updated.phoneCountryCode,
      lookupComplete,
      verificationStatus: "verified" as const,
      valid: ipqs.valid ?? null,
      active: ipqs.active ?? null,
      activeStatus: ipqs.active_status ?? null,
      fraudScore,
      voip,
      prepaid: ipqs.prepaid ?? null,
      risky: ipqs.risky ?? null,
      recentAbuse: ipqs.recent_abuse ?? null,
      leaked: ipqs.leaked ?? null,
      spammer: ipqs.spammer ?? null,
      lineType,
      carrier: ipqs.carrier ?? null,
      phoneCountry: returnedCountry || null,
      accurateCountryCode: ipqs.accurate_country_code ?? null,
      ipSecurity: {
        fraudScore: Number(ipqsIp.fraud_score ?? 0),
        proxy: ipqsIp.proxy ?? false,
        vpn: ipqsIp.vpn ?? false,
        tor: ipqsIp.tor ?? false,
        botStatus: ipqsIp.bot_status ?? false,
        countryCode: ipqsIp.country_code?.toUpperCase() ?? null,
      },
    };
  }

  async consume(reservationId: string, flowId: string, deviceId?: string) {
    const reservation = await this.getActiveReservation({ reservationId, flowId, deviceId });
    await db.delete(registrationFlowReservations).where(eq(registrationFlowReservations.id, reservation.id));
    return reservation;
  }
}

export const registrationFlowReservationService = new RegistrationFlowReservationService();
