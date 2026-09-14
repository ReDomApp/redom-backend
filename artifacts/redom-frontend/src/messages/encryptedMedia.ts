import * as Crypto from "expo-crypto";
import { x25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js";
import { encryptForRecipient, decryptFromSender, type ReDomEncryptedEnvelope } from "./e2ee";

export interface EncryptedMediaEnvelope { version: 1; algorithm: "X25519-AES-256-GCM"; ephemeralPublicKey: string; encryptedMediaKey: string; }

function concat(a: Uint8Array, b: Uint8Array) { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; }
async function mediaKeyFromBytes(bytes: Uint8Array) { return Crypto.AESEncryptionKey.import(bytes); }
function dataUriBytes(dataUri: string) { const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUri); if (!match) throw new Error("Invalid media payload."); const binary = globalThis.atob(match[2]); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return { mime: match[1], bytes }; }
export async function encryptMediaForParticipants(dataUri: string, participantKeys: Array<{ profile_id: string; public_key: string | null }>, context: string) {
  const parsed = dataUriBytes(dataUri); const rawKey = await Crypto.getRandomBytesAsync(32); const key = await mediaKeyFromBytes(rawKey); const sealed = await Crypto.aesEncryptAsync(parsed.bytes, key, { tagLength: 16 }); const combined = await sealed.combined(); const envelopes: Record<string, EncryptedMediaEnvelope> = {};
  for (const participant of participantKeys) { if (!participant.public_key) throw new Error("Every active conversation participant must have a ReDom encryption key before encrypted media can be sent."); const wrapped = await encryptForRecipient(bytesToHex(rawKey), participant.public_key, `${context}|media-key`); envelopes[participant.profile_id] = { version: 1, algorithm: wrapped.algorithm, ephemeralPublicKey: wrapped.ephemeralPublicKey, encryptedMediaKey: wrapped.ciphertext }; }
  return { mime: parsed.mime, ciphertextDataUri: `data:application/octet-stream;base64,${globalThis.btoa(String.fromCharCode(...combined))}`, envelopes };
}
export async function decryptMediaKey(envelope: EncryptedMediaEnvelope, context: string) { const wrapped: ReDomEncryptedEnvelope = { version: 1, algorithm: envelope.algorithm, ephemeralPublicKey: envelope.ephemeralPublicKey, ciphertext: envelope.encryptedMediaKey }; return hexToBytes(await decryptFromSender(wrapped, `${context}|media-key`)); }
export async function decryptMedia(ciphertextBase64: string, mediaKey: Uint8Array, mime: string) { const key = await mediaKeyFromBytes(mediaKey); const sealed = Crypto.AESSealedData.fromCombined(hexToBytes(ciphertextBase64)); const plain = await Crypto.aesDecryptAsync(sealed, key, { output: "bytes" }) as Uint8Array; return `data:${mime};base64,${globalThis.btoa(String.fromCharCode(...plain))}`; }
