import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ensureDeviceKey } from "../messages/e2ee";
import { linkedDeviceService } from "../messages/linkedDeviceService";

export function LinkDeviceScreen() {
  const navigation = useNavigation();
  const [code, setCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<"generate" | "approve" | null>(null);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const generate = async () => {
    if (busy) return;
    setBusy("generate"); setError("");
    try {
      const device = await ensureDeviceKey();
      const platform = Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : Platform.OS === "web" ? "Web" : Platform.OS;
      const result = await linkedDeviceService.start(device.deviceId, device.publicKey, platform === "Web" ? "ReDom web session" : `${platform} device`, platform);
      setGeneratedCode(result.code); setExpiresAt(result.expiresAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create a linking code.");
    } finally { setBusy(null); }
  };

  const approve = async () => {
    const value = code.trim().toUpperCase();
    if (value.length !== 8 || busy) return;
    setBusy("approve"); setError("");
    try {
      const result = await linkedDeviceService.approve(value);
      Alert.alert("Device linked", `${result.deviceLabel || result.platform || "The device"} is now linked to your ReDom account.`, [{ text: "Done", onPress: () => navigation.goBack() }]);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The linking code could not be approved.");
    } finally { setBusy(null); }
  };

  return <SafeAreaView style={styles.root}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>Link a device</Text><View style={styles.spacer} /></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.info}><Text style={styles.infoTitle}>Link ReDom on another device</Text><Text style={styles.infoText}>ReDom uses a short-lived one-time code. The primary device must approve the new device before its encryption identity becomes active.</Text></View>

      <Text style={styles.section}>On the device you want to link</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Generate a one-time code</Text>
        <Text style={styles.cardText}>Show this code to your primary ReDom device. It expires after 5 minutes and can only be used once.</Text>
        {generatedCode ? <View style={styles.codeBox}><Text selectable style={styles.code}>{secondsLeft > 0 ? generatedCode : "EXPIRED"}</Text>{secondsLeft > 0 ? <Text style={styles.expiry}>{Math.ceil(secondsLeft / 60)} min remaining</Text> : null}</View> : null}
        <Pressable disabled={busy !== null || Boolean(generatedCode && secondsLeft > 0)} onPress={() => void generate()} style={[styles.primaryButton, (busy !== null || Boolean(generatedCode && secondsLeft > 0)) && styles.disabled]}>{busy === "generate" ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>{generatedCode && secondsLeft > 0 ? "Code active" : "Generate code"}</Text>}</Pressable>
      </View>

      <Text style={styles.section}>On the primary device</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Approve a new device</Text>
        <Text style={styles.cardText}>Enter the 8-character code displayed on the device you are linking. Only the authenticated primary device can approve it.</Text>
        <TextInput value={code} onChangeText={(value) => setCode(value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={8} placeholder="XXXXXXXX" placeholderTextColor="#98A2B3" style={styles.input} textAlign="center" />
        <Pressable disabled={busy !== null || code.length !== 8} onPress={() => void approve()} style={[styles.primaryButton, (busy !== null || code.length !== 8) && styles.disabled]}>{busy === "approve" ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>Approve device</Text>}</Pressable>
      </View>

      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
      <View style={styles.note}><Text style={styles.noteTitle}>Security</Text><Text style={styles.noteText}>Never share a linking code with someone you do not trust. ReDom does not use the linking code as an encryption key; it authorizes registration of the new device's existing X25519 identity.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F2F5" }, header: { height: 58, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E4E6EB", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 }, back: { fontSize: 38, color: "#1877F2", lineHeight: 42 }, title: { fontSize: 19, fontWeight: "800", color: "#050505" }, spacer: { width: 32 }, content: { padding: 12, paddingBottom: 40 }, info: { backgroundColor: "#FFF", borderRadius: 12, padding: 15, marginBottom: 12 }, infoTitle: { color: "#050505", fontSize: 17, fontWeight: "800", marginBottom: 6 }, infoText: { color: "#667085", fontSize: 14, lineHeight: 21 }, section: { color: "#667085", fontSize: 14, fontWeight: "800", marginTop: 12, marginBottom: 7 }, card: { backgroundColor: "#FFF", borderRadius: 12, padding: 15 }, cardTitle: { color: "#101828", fontSize: 16, fontWeight: "700" }, cardText: { color: "#667085", fontSize: 13, lineHeight: 20, marginTop: 5 }, codeBox: { marginTop: 15, backgroundColor: "#E7F3FF", borderRadius: 12, padding: 18, alignItems: "center" }, code: { color: "#1877F2", fontSize: 30, fontWeight: "900", letterSpacing: 5 }, expiry: { color: "#667085", fontSize: 12, marginTop: 5 }, primaryButton: { minHeight: 46, borderRadius: 10, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", marginTop: 15 }, primaryText: { color: "#FFF", fontSize: 15, fontWeight: "800" }, disabled: { opacity: 0.45 }, input: { marginTop: 15, minHeight: 52, borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 10, color: "#101828", fontSize: 22, fontWeight: "800", letterSpacing: 5, backgroundColor: "#FFF" }, error: { marginTop: 12, backgroundColor: "#FFF1F1", borderRadius: 10, padding: 12 }, errorText: { color: "#B42318", fontSize: 13, lineHeight: 19 }, note: { marginTop: 14, backgroundColor: "#FFF", borderRadius: 12, padding: 15 }, noteTitle: { color: "#101828", fontWeight: "800", fontSize: 14 }, noteText: { color: "#667085", fontSize: 12, lineHeight: 19, marginTop: 5 }
});
