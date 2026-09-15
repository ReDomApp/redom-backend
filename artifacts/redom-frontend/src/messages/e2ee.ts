import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { gcm } from "@noble/ciphers/aes.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js";
import { api } from "../api/client";

const PRIVATE_KEY = "redom.e2ee.x25519.private.v1";
const PUBLIC_KEY = "redom.e2ee.x25519.public.v1";
const DEVICE_ID = "redom.e2ee.device.id.v1";
const CONVERSATION_KEY_PREFIX = "redom.e2ee.conversation.key.v1.";
const ZERO_PUBLIC_KEY = "0000000000000000000000000000000000000000000000000000000000000000";
const AES_GCM_NONCE_BYTES = 12;
const CONVERSATION_ALGORITHM = "X25519-AES-256-GCM" as const;

export interface ReDomEncryptedEnvelope { version: 1; algorithm: "X25519-AES-256-GCM"; ephemeralPublicKey: string; ciphertext: string; }
interface CryptoParticipantLike { device_id: string; public_key: string | null; }

function concat(a: Uint8Array, b: Uint8Array): Uint8Array { const out = new Uint8Array(a.length + b.length); out.set(a, 0); out.set(b, a.length); return out; }
function randomSecretKey(): Uint8Array { return Crypto.getRandomBytes(32); }
function randomConversationKey(): Uint8Array { return Crypto.getRandomBytes(32); }
async function deriveAesKey(shared: Uint8Array, context: string): Promise<Uint8Array> { const contextBytes = new TextEncoder().encode(`ReDom-E2EE-v1|${context}`); return new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, concat(shared, contextBytes))); }
function encryptAesGcm(plaintext: Uint8Array, key: Uint8Array): Uint8Array { const nonce = Crypto.getRandomBytes(AES_GCM_NONCE_BYTES); return concat(nonce, gcm(key, nonce).encrypt(plaintext)); }
function decryptAesGcm(combined: Uint8Array, key: Uint8Array): Uint8Array { if (combined.length <= AES_GCM_NONCE_BYTES + 16) throw new Error("Invalid ReDom encrypted message."); const nonce = combined.slice(0, AES_GCM_NONCE_BYTES); return gcm(key, nonce).decrypt(combined.slice(AES_GCM_NONCE_BYTES)); }

export async function ensureDeviceKey(): Promise<{ deviceId: string; publicKey: string }> {
  const existingPublic = await SecureStore.getItemAsync(PUBLIC_KEY); const existingPrivate = await SecureStore.getItemAsync(PRIVATE_KEY); let deviceId = await SecureStore.getItemAsync(DEVICE_ID);
  if (existingPublic && existingPrivate && deviceId) return { deviceId, publicKey: existingPublic };
  const secret = randomSecretKey(); const publicKey = x25519.getPublicKey(secret); deviceId = deviceId ?? Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID, deviceId, { requireAuthentication: false });
  await SecureStore.setItemAsync(PRIVATE_KEY, bytesToHex(secret), { requireAuthentication: false });
  await SecureStore.setItemAsync(PUBLIC_KEY, bytesToHex(publicKey), { requireAuthentication: false }); return { deviceId, publicKey: bytesToHex(publicKey) };
}
export async function getDeviceId(): Promise<string> { return (await ensureDeviceKey()).deviceId; }
export async function getDevicePublicKey(): Promise<string> { return (await ensureDeviceKey()).publicKey; }

async function legacyEncryptForRecipient(plaintext: string, recipientPublicKeyHex: string, context: string): Promise<ReDomEncryptedEnvelope> {
  const ephemeralSecret = randomSecretKey(); const ephemeralPublic = x25519.getPublicKey(ephemeralSecret); const shared = x25519.getSharedSecret(ephemeralSecret, hexToBytes(recipientPublicKeyHex)); const key = await deriveAesKey(shared, context); const combined = encryptAesGcm(new TextEncoder().encode(plaintext), key);
  return { version: 1, algorithm: CONVERSATION_ALGORITHM, ephemeralPublicKey: bytesToHex(ephemeralPublic), ciphertext: bytesToHex(combined) };
}
async function legacyDecryptFromSender(envelope: ReDomEncryptedEnvelope, context: string): Promise<string> {
  const privateHex = await SecureStore.getItemAsync(PRIVATE_KEY); if (!privateHex) throw new Error("ReDom encryption identity is unavailable.");
  const shared = x25519.getSharedSecret(hexToBytes(privateHex), hexToBytes(envelope.ephemeralPublicKey)); const key = await deriveAesKey(shared, context); return new TextDecoder().decode(decryptAesGcm(hexToBytes(envelope.ciphertext), key));
}

async function getStoredConversationKey(conversationId: string): Promise<Uint8Array | null> {
  const stored = await SecureStore.getItemAsync(`${CONVERSATION_KEY_PREFIX}${conversationId}`); return stored ? hexToBytes(stored) : null;
}
async function saveConversationKey(conversationId: string, key: Uint8Array) { await SecureStore.setItemAsync(`${CONVERSATION_KEY_PREFIX}${conversationId}`, bytesToHex(key), { requireAuthentication: false }); }

async function establishConversationKey(conversationId: string, participants: CryptoParticipantLike[]): Promise<Uint8Array> {
  const device = await ensureDeviceKey();
  let key = await getStoredConversationKey(conversationId);
  let state: { initialized?: boolean; envelope?: ReDomEncryptedEnvelope; deviceIds?: string[] } | null = null;
  try {
    state = await api.get<{ success: boolean; initialized: boolean; envelope?: ReDomEncryptedEnvelope; deviceIds?: string[] }>(`/messages/crypto/conversations/${conversationId}/key?deviceId=${encodeURIComponent(device.deviceId)}`);
  } catch (error: any) {
    const status = Number(error?.status ?? error?.response?.status ?? 0);
    if (status !== 404 && status !== 409) throw error;
    if (status === 409 && error?.response?.data?.needsDeviceEnvelope) state = error.response.data;
  }
  if (!key && state?.envelope) { key = hexToBytes(await legacyDecryptFromSender(state.envelope, `conversation-key:${conversationId}`)); await saveConversationKey(conversationId, key); }
  if (!key) {
    key = randomConversationKey();
    const envelopes: Record<string, ReDomEncryptedEnvelope> = {};
    for (const participant of participants) { if (!participant.public_key) throw new Error("This conversation participant has not registered an encryption device."); envelopes[participant.device_id] = await legacyEncryptForRecipient(bytesToHex(key), participant.public_key, `conversation-key:${conversationId}`); }
    try { await api.post(`/messages/crypto/conversations/${conversationId}/key/initialize`, { deviceId: device.deviceId, envelopes }); }
    catch (error: any) { const status = Number(error?.status ?? error?.response?.status ?? 0); if (status !== 409) throw error; }
    await saveConversationKey(conversationId, key);
    return key;
  }
  const covered = new Set(state?.deviceIds ?? []); const missing: Record<string, ReDomEncryptedEnvelope> = {};
  for (const participant of participants) { if (!covered.has(participant.device_id)) { if (!participant.public_key) throw new Error("This conversation participant has not registered an encryption device."); missing[participant.device_id] = await legacyEncryptForRecipient(bytesToHex(key), participant.public_key, `conversation-key:${conversationId}`); } }
  if (Object.keys(missing).length) await api.post(`/messages/crypto/conversations/${conversationId}/key/envelopes`, { deviceId: device.deviceId, envelopes: missing });
  return key;
}

async function conversationKeyForDecryption(conversationId: string): Promise<Uint8Array> {
  const local = await getStoredConversationKey(conversationId); if (local) return local;
  const device = await ensureDeviceKey();
  const result = await api.get<{ success: boolean; initialized: boolean; envelope?: ReDomEncryptedEnvelope }>(`/messages/crypto/conversations/${conversationId}/key?deviceId=${encodeURIComponent(device.deviceId)}`);
  if (!result.envelope) throw new Error("This device has not received the conversation encryption key.");
  const key = hexToBytes(await legacyDecryptFromSender(result.envelope, `conversation-key:${conversationId}`)); await saveConversationKey(conversationId, key); return key;
}

export async function encryptForRecipient(plaintext: string, _recipientPublicKeyHex: string, context: string): Promise<ReDomEncryptedEnvelope> {
  const key = await conversationKeyForEncryption(context); const combined = encryptAesGcm(new TextEncoder().encode(plaintext), key);
  return { version: 1, algorithm: CONVERSATION_ALGORITHM, ephemeralPublicKey: ZERO_PUBLIC_KEY, ciphertext: bytesToHex(combined) };
}

let encryptionParticipantProvider: ((conversationId: string) => Promise<CryptoParticipantLike[]>) | null = null;
export function setEncryptionParticipantProvider(provider: (conversationId: string) => Promise<CryptoParticipantLike[]>) { encryptionParticipantProvider = provider; }
async function conversationKeyForEncryption(conversationId: string) { if (!encryptionParticipantProvider) throw new Error("ReDom conversation encryption is not initialized."); return establishConversationKey(conversationId, await encryptionParticipantProvider(conversationId)); }

export async function decryptFromSender(envelope: ReDomEncryptedEnvelope, context: string): Promise<string> {
  if (envelope.version !== 1 || envelope.algorithm !== CONVERSATION_ALGORITHM) throw new Error("Unsupported ReDom encrypted message.");
  if (envelope.ephemeralPublicKey === ZERO_PUBLIC_KEY) { const key = await conversationKeyForDecryption(context); return new TextDecoder().decode(decryptAesGcm(hexToBytes(envelope.ciphertext), key)); }
  return legacyDecryptFromSender(envelope, context);
}
export async function decryptEnvelopeMap(payload: Record<string, unknown>, context: string): Promise<string | null> {
  for (const value of Object.values(payload)) { try { if (value && typeof value === "object") return await decryptFromSender(value as ReDomEncryptedEnvelope, context); } catch { /* envelope belongs to another device or key version */ } }
  return null;
}
