import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { env } from "../config/env";
import { getStoredSession } from "../auth/storage";

function absoluteUrl(fileUrl: string): string {
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  return `${env.apiBaseUrl}${fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`}`;
}

export function SecureMessageImage({ fileUrl, size = 230 }: { fileUrl: string; size?: number }) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await getStoredSession();
        const response = await fetch(absoluteUrl(fileUrl), { headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : undefined });
        if (!response.ok) throw new Error("Media unavailable");
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = () => { if (!cancelled && typeof reader.result === "string") setSource(reader.result); };
        reader.readAsDataURL(blob);
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; };
  }, [fileUrl]);
  if (failed) return <View style={[styles.fallback, { width: size, height: size }]} />;
  if (!source) return <View style={[styles.loading, { width: size, height: size }]}><ActivityIndicator /></View>;
  return <Image source={{ uri: source }} style={{ width: size, height: size, borderRadius: 14 }} resizeMode="cover" />;
}

const styles = StyleSheet.create({ loading: { alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#E4E6EB" }, fallback: { borderRadius: 14, backgroundColor: "#E4E6EB" } });
