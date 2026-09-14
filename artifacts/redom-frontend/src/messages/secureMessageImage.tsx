import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { env } from "../config/env";
import { getStoredSession } from "../auth/storage";
import { decryptMedia, decryptMediaKey } from "./encryptedMedia";
import { getDeviceId } from "./e2ee";
import { messageService } from "./messageService";

function absoluteUrl(fileUrl: string): string { if (/^https?:\/\//i.test(fileUrl)) return fileUrl; return `${env.apiBaseUrl}${fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`}`; }
function conversationIdFromFileUrl(fileUrl: string): string | null { const match = /\/messages\/media\/messages\/([^/]+)\//.exec(fileUrl); return match?.[1] ?? null; }
function bytesToBase64(bytes: Uint8Array) { let out = ""; const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) out += String.fromCharCode(...bytes.subarray(i, i + chunk)); return globalThis.btoa(out); }

export function SecureMessageImage({ fileUrl, size = 230 }: { fileUrl: string; size?: number }) {
  const [source, setSource] = useState<string | null>(null); const [failed, setFailed] = useState(false);
  useEffect(() => { let cancelled = false; void (async () => { try {
    const session = await getStoredSession(); if (!session?.accessToken) throw new Error("Authentication required.");
    const response = await fetch(absoluteUrl(fileUrl), { headers: { Authorization: `Bearer ${session.accessToken}` }, cache: "no-store" });
    if (!response.ok) throw new Error("Media unavailable.");
    const encrypted = response.headers.get("X-ReDom-Media-Encrypted") === "1";
    const mime = response.headers.get("X-ReDom-Media-Mime") || response.headers.get("Content-Type") || "image/jpeg";
    const messageId = response.headers.get("X-ReDom-Media-Message-Id");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let dataUri: string;
    if (encrypted) {
      if (!messageId) throw new Error("Encrypted media metadata is unavailable.");
      const conversationId = conversationIdFromFileUrl(fileUrl); if (!conversationId) throw new Error("Conversation context is unavailable.");
      const deviceId = await getDeviceId();
      const keyResult = await messageService.getEncryptedMediaKey(messageId);
      const mediaKey = await decryptMediaKey(keyResult.envelope, conversationId, deviceId);
      dataUri = await decryptMedia(bytesToBase64(bytes), mediaKey, mime);
    } else dataUri = `data:${mime};base64,${bytesToBase64(bytes)}`;
    if (!cancelled) setSource(dataUri);
  } catch { if (!cancelled) setFailed(true); } })(); return () => { cancelled = true; }; }, [fileUrl]);
  if (failed) return <View style={[styles.fallback, { width: size, height: size }]} />;
  if (!source) return <View style={[styles.loading, { width: size, height: size }]}><ActivityIndicator /></View>;
  return <Image source={{ uri: source }} style={{ width: size, height: size, borderRadius: 14 }} resizeMode="cover" />;
}
const styles = StyleSheet.create({ loading: { alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#E4E6EB" }, fallback: { borderRadius: 14, backgroundColor: "#E4E6EB" } });
