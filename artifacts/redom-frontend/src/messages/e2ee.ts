import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { gcm } from "@noble/ciphers/aes.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js";
import { api } from "../api/client";

const PRIVATE_KEY = "redom.e2ee.x25519.private.v1";
const PUBLIC_KEY = "redom.e2ee.x25519.public.v1";
const DEVICE_ID = "redom.e2ee.device.id.v1";
const CONVERSATION_KEY_PREFIX = "redom.e2ee.conversation.key.v2.";
const ZERO_PUBLIC_KEY = "0000000000000000000000000000000000000000000000000000000000000000";
const AES_GCM_NONCE_BYTES = 12;
const CONVERSATION_ALGORITHM = "X25519-AES-256-GCM" as const;

export interface ReDomEncryptedEnvelope { version: 1; algorithm: "X25519-AES-256-GCM"; ephemeralPublicKey: string; ciphertext: string; conversationKeyVersion?: number; }
interface CryptoParticipantLike { profile_id: string; device_id: string; public_key: string | null; }
interface StoredConversationKey { keyVersion: number; key: string; }
interface ConversationKeyState { keyVersion: number; envelope?: ReDomEncryptedEnvelope; deviceIds?: string[]; }

function concat(a: Uint8Array, b: Uint8Array): Uint8Array { const out = new Uint8Array(a.length + b.length); out.set(a, 0); out.set(b, a.length); return out; }
function randomSecretKey(): Uint8Array { return Crypto.getRandomBytes(32); }
function randomConversationKey(): Uint8Array { return Crypto.getRandomBytes(32); }
async function deriveAesKey(shared: Uint8Array, context: string): Promise<Uint8Array> { const contextBytes = new TextEncoder().encode(`ReDom-E2EE-v1|${context}`); return new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, concat(shared, contextBytes))); }
function encryptAesGcm(plaintext: Uint8Array, key: Uint8Array): Uint8Array { const nonce = Crypto.getRandomBytes(AES_GCM_NONCE_BYTES); return concat(nonce, gcm(key, nonce).encrypt(plaintext)); }
function decryptAesGcm(combined: Uint8Array, key: Uint8Array): Uint8Array { if (combined.length <= AES_GCM_NONCE_BYTES + 16) throw new Error("Invalid ReDom encrypted message."); const nonce = combined.slice(0, AES_GCM_NONCE_BYTES); return gcm(key, nonce).decrypt(combined.slice(AES_GCM_NONCE_BYTES)); }
function conversationIdFromContext(context: string): string { return context.split("|")[0]; }

export async function ensureDeviceKey(): Promise<{ deviceId: string; publicKey: string }> {
  const existingPublic = await SecureStore.getItemAsync(PUBLIC_KEY); const existingPrivate = await SecureStore.getItemAsync(PRIVATE_KEY); let deviceId = await SecureStore.getItemAsync(DEVICE_ID);
  if (existingPublic && existingPrivate && deviceId) return { deviceId, publicKey: existingPublic };
  const secret = randomSecretKey(); const publicKey = x25519.getPublicKey(secret); deviceId = deviceId ?? Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID, deviceId, { requireAuthentication: false }); await SecureStore.setItemAsync(PRIVATE_KEY, bytesToHex(secret), { requireAuthentication: false }); await SecureStore.setItemAsync(PUBLIC_KEY, bytesToHex(publicKey), { requireAuthentication: false }); return { deviceId, publicKey: bytesToHex(publicKey) };
}
export async function getDeviceId(): Promise<string> { return (await ensureDeviceKey()).deviceId; }
export async function getDevicePublicKey(): Promise<string> { return (await ensureDeviceKey()).publicKey; }
async function legacyEncryptForRecipient(plaintext: string, recipientPublicKeyHex: string, context: string): Promise<ReDomEncryptedEnvelope> { const ephemeralSecret = randomSecretKey(); const ephemeralPublic = x25519.getPublicKey(ephemeralSecret); const shared = x25519.getSharedSecret(ephemeralSecret, hexToBytes(recipientPublicKeyHex)); const key = await deriveAesKey(shared, context); return { version: 1, algorithm: CONVERSATION_ALGORITHM, ephemeralPublicKey: bytesToHex(ephemeralPublic), ciphertext: bytesToHex(encryptAesGcm(new TextEncoder().encode(plaintext), key)) }; }
async function legacyDecryptFromSender(envelope: ReDomEncryptedEnvelope, context: string): Promise<string> { const privateHex = await SecureStore.getItemAsync(PRIVATE_KEY); if (!privateHex) throw new Error("ReDom encryption identity is unavailable."); const shared = x25519.getSharedSecret(hexToBytes(privateHex), hexToBytes(envelope.ephemeralPublicKey)); const key = await deriveAesKey(shared, context); return new TextDecoder().decode(decryptAesGcm(hexToBytes(envelope.ciphertext), key)); }
async function getStoredConversationKey(conversationId: string): Promise<StoredConversationKey | null> { const stored = await SecureStore.getItemAsync(`${CONVERSATION_KEY_PREFIX}${conversationId}`); if (!stored) return null; try { const parsed = JSON.parse(stored) as StoredConversationKey; if (parsed?.keyVersion && typeof parsed.key === "string") return parsed; } catch { /* migrate legacy */ } if (/^[0-9a-f]{64}$/i.test(stored)) return { keyVersion: 1, key: stored }; return null; }
async function saveConversationKey(conversationId: string, keyVersion: number, key: Uint8Array) { const value: StoredConversationKey = { keyVersion, key: bytesToHex(key) }; await SecureStore.setItemAsync(`${CONVERSATION_KEY_PREFIX}${conversationId}`, JSON.stringify(value), { requireAuthentication: false }); }
async function cryptoParticipants(conversationId: string): Promise<CryptoParticipantLike[]> { const result = await api.get<{ success: boolean; participants: CryptoParticipantLike[] }>(`/messages/crypto/conversations/${conversationId}/crypto-participants`); return result.participants; }
async function getConversationKeyState(conversationId: string, deviceId: string): Promise<ConversationKeyState | null> { try { return await api.get<ConversationKeyState>(`/messages/crypto/conversations/${conversationId}/key?deviceId=${encodeURIComponent(deviceId)}`); } catch (error: any) { const status = Number(error?.status ?? error?.response?.status ?? 0); const data = error?.response?.data as ConversationKeyState | undefined; if (status === 404) return null; if (status === 409 && data) return data; throw error; } }

async function establishConversationKey(conversationId: string, participants: CryptoParticipantLike[]): Promise<{ key: Uint8Array; keyVersion: number }> {
  const device = await ensureDeviceKey(); const stored = await getStoredConversationKey(conversationId); const state = await getConversationKeyState(conversationId, device.deviceId);
  if (state?.keyVersion && stored?.keyVersion === state.keyVersion) {
    const covered = new Set(state.deviceIds ?? []); const missing: Record<string, ReDomEncryptedEnvelope> = {};
    for (const participant of participants) if (!covered.has(participant.device_id)) { if (!participant.public_key) throw new Error("This conversation participant has not registered an encryption device."); missing[participant.device_id] = await legacyEncryptForRecipient(stored.key, participant.public_key, `conversation-key:${conversationId}:v${state.keyVersion}`); }
    if (Object.keys(missing).length) await api.post(`/messages/crypto/conversations/${conversationId}/key/envelopes`, { deviceId: device.deviceId, envelopes: missing });
    return { key: hexToBytes(stored.key), keyVersion: stored.keyVersion };
  }
  if (state?.envelope && state.keyVersion) { const key = hexToBytes(await legacyDecryptFromSender(state.envelope, `conversation-key:${conversationId}:v${state.keyVersion}`)); await saveConversationKey(conversationId, state.keyVersion, key); return { key, keyVersion: state.keyVersion }; }
  if (state?.keyVersion && !state.envelope) throw new Error("This device has not received the current conversation encryption key. Open the chat on an authorized device to provision it.");
  const key = randomConversationKey(); const envelopes: Record<string, ReDomEncryptedEnvelope> = {};
  for (const participant of participants) { if (!participant.public_key) throw new Error("This conversation participant has not registered an encryption device."); envelopes[participant.device_id] = await legacyEncryptForRecipient(bytesToHex(key), participant.public_key, `conversation-key:${conversationId}:v1`); }
  try { await api.post(`/messages/crypto/conversations/${conversationId}/key/initialize`, { deviceId: device.deviceId, envelopes }); } catch (error: any) { const status = Number(error?.status ?? error?.response?.status ?? 0); if (status !== 409) throw error; const latest = await getConversationKeyState(conversationId, device.deviceId); if (!latest?.envelope || !latest.keyVersion) throw new Error("Conversation encryption was initialized on another device. This device must receive its current key envelope."); const existingKey = hexToBytes(await legacyDecryptFromSender(latest.envelope, `conversation-key:${conversationId}:v${latest.keyVersion}`)); await saveConversationKey(conversationId, latest.keyVersion, existingKey); return { key: existingKey, keyVersion: latest.keyVersion }; }
  await saveConversationKey(conversationId, 1, key); return { key, keyVersion: 1 };
}

export async function ensureConversationEncryption(conversationId: string) { await establishConversationKey(conversationId, await cryptoParticipants(conversationId)); }
export async function rotateConversationEncryption(conversationId: string, excludeProfileIds: string[] = []): Promise<number> {
  const participants = await cryptoParticipants(conversationId); const excluded = new Set(excludeProfileIds); const device = await ensureDeviceKey(); const current = await getConversationKeyState(conversationId, device.deviceId); if (!current?.keyVersion) throw new Error("Conversation encryption must be established before it can rotate.");
  const key = randomConversationKey(); const envelopes: Record<string, ReDomEncryptedEnvelope> = {};
  for (const participant of participants) { if (excluded.has(participant.profile_id)) continue; if (!participant.public_key) throw new Error("Every remaining conversation device must have an encryption identity before key rotation."); envelopes[participant.device_id] = await legacyEncryptForRecipient(bytesToHex(key), participant.public_key, `conversation-key:${conversationId}:v${current.keyVersion + 1}`); }
  if (!Object.keys(envelopes).length) throw new Error("Key rotation requires at least one authorized device.");
  const result = await api.post<{ success: boolean; keyVersion: number }>(`/messages/crypto/conversations/${conversationId}/key/rotate`, { deviceId: device.deviceId, excludeProfileIds: [...excluded], envelopes });
  await saveConversationKey(conversationId, result.keyVersion, key); return result.keyVersion;
}
async function conversationKeyForEncryption(context: string) { return establishConversationKey(conversationIdFromContext(context), await cryptoParticipants(conversationIdFromContext(context))); }
async function conversationKeyForDecryption(context: string): Promise<{ key: Uint8Array; keyVersion: number }> { const conversationId = conversationIdFromContext(context); const device = await ensureDeviceKey(); const state = await getConversationKeyState(conversationId, device.deviceId); if (!state?.keyVersion) throw new Error("This conversation has no established encryption state."); const stored = await getStoredConversationKey(conversationId); if (stored?.keyVersion === state.keyVersion) return { key: hexToBytes(stored.key), keyVersion: stored.keyVersion }; if (!state.envelope) throw new Error("This device has not received the current conversation encryption key."); const key = hexToBytes(await legacyDecryptFromSender(state.envelope, `conversation-key:${conversationId}:v${state.keyVersion}`)); await saveConversationKey(conversationId, state.keyVersion, key); return { key, keyVersion: state.keyVersion }; }

export async function encryptForRecipient(plaintext: string, _recipientPublicKeyHex: string, context: string): Promise<ReDomEncryptedEnvelope> { const state = await conversationKeyForEncryption(context); return { version: 1, algorithm: CONVERSATION_ALGORITHM, ephemeralPublicKey: ZERO_PUBLIC_KEY, ciphertext: bytesToHex(encryptAesGcm(new TextEncoder().encode(plaintext), state.key)), conversationKeyVersion: state.keyVersion }; }
export async function decryptFromSender(envelope: ReDomEncryptedEnvelope, context: string): Promise<string> { if (envelope.version !== 1 || envelope.algorithm !== CONVERSATION_ALGORITHM) throw new Error("Unsupported ReDom encrypted message."); if (envelope.ephemeralPublicKey === ZERO_PUBLIC_KEY) { const state = await conversationKeyForDecryption(context); if (envelope.conversationKeyVersion && envelope.conversationKeyVersion !== state.keyVersion) throw new Error("Encrypted message belongs to a previous conversation key version."); return new TextDecoder().decode(decryptAesGcm(hexToBytes(envelope.ciphertext), state.key)); } return legacyDecryptFromSender(envelope, context); }
export async function decryptEnvelopeMap(payload: Record<string, unknown>, context: string): Promise<string | null> { for (const value of Object.values(payload)) { try { if (value && typeof value === "object") return await decryptFromSender(value as ReDomEncryptedEnvelope, context); } catch { /* try the next authorized device envelope */ } } return null; }
