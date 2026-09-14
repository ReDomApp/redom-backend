import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { x25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js";

const PRIVATE_KEY = "redom.e2ee.x25519.private.v1";
const PUBLIC_KEY = "redom.e2ee.x25519.public.v1";

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0); out.set(b, a.length); return out;
}

async function deriveAesKey(shared: Uint8Array, context: string) {
  const contextBytes = new TextEncoder().encode(`ReDom-E2EE-v1|${context}`);
  const material = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, concat(shared, contextBytes));
  return Crypto.AESEncryptionKey.import(material);
}

export async function ensureDeviceKey(): Promise<{ publicKey: string }> {
  const existingPublic = await SecureStore.getItemAsync(PUBLIC_KEY);
  const existingPrivate = await SecureStore.getItemAsync(PRIVATE_KEY);
  if (existingPublic && existingPrivate) return { publicKey: existingPublic };
  const secret = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(secret);
  await SecureStore.setItemAsync(PRIVATE_KEY, bytesToHex(secret), { requireAuthentication: false });
  await SecureStore.setItemAsync(PUBLIC_KEY, bytesToHex(publicKey), { requireAuthentication: false });
  return { publicKey: bytesToHex(publicKey) };
}

export async function getDevicePublicKey(): Promise<string> {
  return (await ensureDeviceKey()).publicKey;
}

export async function encryptForRecipient(plaintext: string, recipientPublicKeyHex: string, context: string) {
  const privateHex = await SecureStore.getItemAsync(PRIVATE_KEY);
  if (!privateHex) throw new Error("ReDom encryption identity is unavailable.");
  const ephemeralSecret = x25519.utils.randomSecretKey();
  const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);
  const recipientPublic = hexToBytes(recipientPublicKeyHex);
  const shared = x25519.getSharedSecret(ephemeralSecret, recipientPublic);
  const key = await deriveAesKey(shared, context);
  const sealed = await Crypto.aesEncryptAsync(new TextEncoder().encode(plaintext), key, { tagLength: 16 });
  const combined = await sealed.combined();
  return { version: 1, algorithm: "X25519-AES-256-GCM", ephemeralPublicKey: bytesToHex(ephemeralPublic), ciphertext: bytesToHex(combined) };
}

export async function decryptFromSender(envelope: { version: number; algorithm: string; ephemeralPublicKey: string; ciphertext: string }, context: string): Promise<string> {
  if (envelope.version !== 1 || envelope.algorithm !== "X25519-AES-256-GCM") throw new Error("Unsupported ReDom encrypted message.");
  const privateHex = await SecureStore.getItemAsync(PRIVATE_KEY);
  if (!privateHex) throw new Error("ReDom encryption identity is unavailable.");
  const shared = x25519.getSharedSecret(hexToBytes(privateHex), hexToBytes(envelope.ephemeralPublicKey));
  const key = await deriveAesKey(shared, context);
  const sealed = Crypto.AESSealedData.fromCombined(hexToBytes(envelope.ciphertext));
  const plaintext = await Crypto.aesDecryptAsync(sealed, key, { output: "bytes" });
  return new TextDecoder().decode(plaintext as Uint8Array);
}
