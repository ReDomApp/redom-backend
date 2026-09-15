import * as Crypto from "expo-crypto";
import { gcm } from "@noble/ciphers/aes.js";
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js";
import { encryptForRecipient, decryptFromSender, type ReDomEncryptedEnvelope } from "./e2ee";

export interface EncryptedMediaEnvelope { version: 1; algorithm: "X25519-AES-256-GCM"; ephemeralPublicKey: string; encryptedMediaKey: string; }
const AES_GCM_NONCE_BYTES = 12;
function concat(a: Uint8Array, b: Uint8Array): Uint8Array { const out = new Uint8Array(a.length + b.length); out.set(a, 0); out.set(b, a.length); return out; }
function dataUriBytes(dataUri: string) { const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUri); if (!match) throw new Error("Invalid media payload."); const binary = globalThis.atob(match[2]); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return { mime: match[1], bytes }; }
function bytesToBase64(bytes: Uint8Array): string { let binary = ""; const chunkSize = 0x8000; for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length))); return globalThis.btoa(binary); }
function base64ToBytes(value: string): Uint8Array { const binary = globalThis.atob(value); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; }
function encryptMediaBytes(plaintext: Uint8Array, key: Uint8Array): Uint8Array { const nonce = Crypto.getRandomBytes(AES_GCM_NONCE_BYTES); return concat(nonce, gcm(key, nonce).encrypt(plaintext)); }
function decryptMediaBytes(combined: Uint8Array, key: Uint8Array): Uint8Array { if (combined.length <= AES_GCM_NONCE_BYTES + 16) throw new Error("Invalid encrypted media payload."); const nonce = combined.slice(0, AES_GCM_NONCE_BYTES); return gcm(key, nonce).decrypt(combined.slice(AES_GCM_NONCE_BYTES)); }

export async function encryptMediaForParticipants(dataUri: string, participantKeys: Array<{ profile_id: string; device_id: string; public_key: string | null }>, context: string) {
  const parsed = dataUriBytes(dataUri); const rawKey = Crypto.getRandomBytes(32); const combined = encryptMediaBytes(parsed.bytes, rawKey); const envelopes: Record<string, EncryptedMediaEnvelope> = {};
  for (const participant of participantKeys) { if (!participant.public_key || !participant.device_id) throw new Error("Every active ReDom device must have an encryption key before encrypted media can be sent."); const wrapped = await encryptForRecipient(bytesToHex(rawKey), participant.public_key, `${context}|media-key|${participant.device_id}`); envelopes[participant.device_id] = { version: 1, algorithm: wrapped.algorithm, ephemeralPublicKey: wrapped.ephemeralPublicKey, encryptedMediaKey: wrapped.ciphertext }; }
  return { mime: parsed.mime, ciphertextDataUri: `data:application/octet-stream;base64,${bytesToBase64(combined)}`, envelopes };
}
export async function decryptMediaKey(envelope: EncryptedMediaEnvelope, context: string, deviceId?: string) { const wrapped: ReDomEncryptedEnvelope = { version: 1, algorithm: envelope.algorithm, ephemeralPublicKey: envelope.ephemeralPublicKey, ciphertext: envelope.encryptedMediaKey }; return hexToBytes(await decryptFromSender(wrapped, `${context}|media-key${deviceId ? `|${deviceId}` : ""}`)); }
export async function decryptMedia(ciphertextBase64: string, mediaKey: Uint8Array, mime: string) { const plain = decryptMediaBytes(base64ToBytes(ciphertextBase64), mediaKey); return `data:${mime};base64,${bytesToBase64(plain)}`; }
