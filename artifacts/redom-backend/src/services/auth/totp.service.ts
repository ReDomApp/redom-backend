import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../../database/db";
import { users } from "../../database/schema";
import { accountSecurity } from "../../database/accountSecurity";
import { totpLoginChallenges } from "../../database/totp-login-challenges.schema";

const PERIOD = 30;
const DIGITS = 6;
const SETUP_TTL = 10 * 60 * 1000;
const LOGIN_TTL = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function key(): Buffer {
  const raw = process.env.REDOM_TOTP_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("Authenticator security is not configured.");
  const value = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (value.length !== 32) throw new Error("Authenticator security is not configured.");
  return value;
}
function encrypt(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}
function decrypt(value: string) {
  const [iv, tag, data] = value.split(".");
  if (!iv || !tag || !data) throw new Error("Authenticator secret is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
function encodeBase32(input: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of input) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function decodeBase32(input: string) {
  const normalized = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0, value = 0; const out: number[] = [];
  for (const char of normalized) { const n = ALPHABET.indexOf(char); if (n < 0) throw new Error("Invalid authenticator secret."); value = (value << 5) | n; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function hotp(secret: string, counter: number) {
  const counterBuffer = Buffer.alloc(8); counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1_000_000).padStart(DIGITS, "0");
}
function verifyTotp(secret: string, code: string): number | null {
  if (!/^\d{6}$/.test(code.replace(/\s/g, ""))) return null;
  const current = Math.floor(Date.now() / 1000 / PERIOD); const supplied = code.replace(/\s/g, "");
  for (const delta of [-1, 0, 1]) { const step = current + delta; if (step < 0) continue; const expected = hotp(secret, step); if (timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return step; }
  return null;
}
function recoveryCode() { const raw = randomBytes(5).toString("hex").toUpperCase(); return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`; }
function recoveryHash(code: string) { return createHash("sha256").update(code.replace(/[^A-Za-z0-9]/g, "").toUpperCase()).digest("hex"); }
function uri(email: string, secret: string) { const label = encodeURIComponent(`ReDom:${email}`); const query = new URLSearchParams({ secret, issuer: "ReDom", algorithm: "SHA1", digits: "6", period: "30" }); return `otpauth://totp/${label}?${query}`; }

async function securityFor(userId: string) {
  const existing = await db.query.accountSecurity.findFirst({ where: eq(accountSecurity.userId, userId) });
  if (existing) return existing;
  const [created] = await db.insert(accountSecurity).values({ userId, updatedAt: new Date() }).returning();
  return created;
}

export class TotpService {
  async beginSetup(userId: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user || user.accountStatus !== "active") throw new Error("ReDom account could not be loaded.");
    const security = await securityFor(userId);
    if (security.twoFactorEnabled) throw new Error("Disable the current two-factor method before setting up Authenticator.");
    if (!user.email || !user.emailVerified) throw new Error("A verified email address is required for Authenticator setup.");
    const secret = encodeBase32(randomBytes(20)); const expiresAt = new Date(Date.now() + SETUP_TTL);
    await db.update(accountSecurity).set({ totpSetupSecretEncrypted: encrypt(secret), totpSetupExpiresAt: expiresAt, updatedAt: new Date() }).where(eq(accountSecurity.userId, userId));
    return { success: true as const, otpauthUri: uri(user.email, secret), setupKey: secret, algorithm: "SHA1", digits: DIGITS, period: PERIOD, expiresAt };
  }

  async confirmSetup(userId: string, code: string) {
    const security = await db.query.accountSecurity.findFirst({ where: eq(accountSecurity.userId, userId) });
    if (!security?.totpSetupSecretEncrypted || !security.totpSetupExpiresAt || security.totpSetupExpiresAt.getTime() <= Date.now()) throw new Error("Your Authenticator setup has expired. Start setup again to generate a new key.");
    const secret = decrypt(security.totpSetupSecretEncrypted); const step = verifyTotp(secret, code);
    if (step === null) throw new Error("Invalid code. Enter the 6-digit code shown in your authenticator app.");
    const codes = Array.from({ length: 10 }, recoveryCode);
    await db.update(accountSecurity).set({ twoFactorEnabled: true, twoFactorMethod: "authenticator", totpEnabled: true, totpSecretEncrypted: encrypt(secret), totpAlgorithm: "SHA1", totpDigits: DIGITS, totpPeriod: PERIOD, totpConfirmedAt: new Date(), totpLastUsedStep: String(step), totpSetupSecretEncrypted: null, totpSetupExpiresAt: null, recoveryCodesHashes: JSON.stringify(codes.map(recoveryHash)), recoveryCodesGeneratedAt: new Date(), updatedAt: new Date() }).where(eq(accountSecurity.userId, userId));
    return { success: true as const, recoveryCodes: codes };
  }

  async createLoginChallenge(params: { userId: string; deviceId?: string; requestIp?: string; userAgent?: string }) {
    const security = await db.query.accountSecurity.findFirst({ where: eq(accountSecurity.userId, params.userId) });
    if (!security?.twoFactorEnabled || security.twoFactorMethod !== "authenticator" || !security.totpEnabled || !security.totpSecretEncrypted) throw new Error("Authenticator two-factor authentication is not enabled.");
    const [challenge] = await db.insert(totpLoginChallenges).values({ userId: params.userId, deviceId: params.deviceId, requestIp: params.requestIp, userAgent: params.userAgent, expiresAt: new Date(Date.now() + LOGIN_TTL) }).returning();
    return { challengeId: challenge.id, expiresAt: challenge.expiresAt };
  }

  async verifyLoginChallenge(params: { challengeId: string; userId: string; code: string; deviceId?: string; requestIp?: string }) {
    const challenge = await db.query.totpLoginChallenges.findFirst({ where: and(eq(totpLoginChallenges.id, params.challengeId), eq(totpLoginChallenges.userId, params.userId), gt(totpLoginChallenges.expiresAt, new Date())) });
    if (!challenge || challenge.consumedAt) throw new Error("Authenticator verification has expired. Please log in again.");
    if (challenge.deviceId && challenge.deviceId !== params.deviceId) throw new Error("This authenticator challenge belongs to another device.");
    if (challenge.requestIp && params.requestIp && challenge.requestIp !== params.requestIp) throw new Error("The verification request originated from a different network address.");
    if (Number(challenge.attemptCount) >= MAX_ATTEMPTS) throw new Error("Too many invalid authenticator codes. Please log in again.");
    const security = await db.query.accountSecurity.findFirst({ where: eq(accountSecurity.userId, params.userId) });
    if (!security?.totpEnabled || security.twoFactorMethod !== "authenticator" || !security.totpSecretEncrypted) throw new Error("Authenticator two-factor authentication is not enabled.");
    const step = verifyTotp(decrypt(security.totpSecretEncrypted), params.code);
    if (step === null) { await db.update(totpLoginChallenges).set({ attemptCount: String(Number(challenge.attemptCount) + 1), updatedAt: new Date() }).where(eq(totpLoginChallenges.id, challenge.id)); throw new Error("Invalid code. Enter the 6-digit code shown in your authenticator app."); }
    if (security.totpLastUsedStep && Number(security.totpLastUsedStep) === step) throw new Error("This authenticator code has already been used. Wait for the next code.");
    await db.update(totpLoginChallenges).set({ consumedAt: new Date(), updatedAt: new Date() }).where(eq(totpLoginChallenges.id, challenge.id));
    await db.update(accountSecurity).set({ totpLastUsedStep: String(step), updatedAt: new Date() }).where(eq(accountSecurity.userId, params.userId));
    return { success: true as const };
  }

  async useRecoveryCode(userId: string, code: string) {
    const security = await db.query.accountSecurity.findFirst({ where: eq(accountSecurity.userId, userId) });
    if (!security?.twoFactorEnabled || security.twoFactorMethod !== "authenticator" || !security.recoveryCodesHashes) throw new Error("Recovery codes are not available.");
    const hashes: string[] = JSON.parse(security.recoveryCodesHashes); const index = hashes.indexOf(recoveryHash(code));
    if (index < 0) throw new Error("Invalid or already used recovery code.");
    hashes.splice(index, 1);
    await db.update(accountSecurity).set({ recoveryCodesHashes: JSON.stringify(hashes), updatedAt: new Date() }).where(eq(accountSecurity.userId, userId));
    return { success: true as const, remainingCodes: hashes.length };
  }
}
export const totpService = new TotpService();
