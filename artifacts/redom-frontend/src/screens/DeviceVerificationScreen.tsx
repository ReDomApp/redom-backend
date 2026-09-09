import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuthContext } from "../auth/context";
import { getDeviceId } from "../utils/device";
import SecurityShield from "../assets/auth/security-shield.svg";
import { ReDomScreen } from "../layout/ReDomScreen";
import { useLanguage } from "../i18n/LanguageProvider";
import type { RootStackParamList } from "../routing/types";

const BLUE = "#1877F2"; const CODE_LENGTH = 6;
type Props = NativeStackScreenProps<RootStackParamList, "DeviceVerification">;

export function DeviceVerificationScreen({ route, navigation }: Props) {
  const { verifyLoginDevice } = useAuthContext(); const { uiMessage, t } = useLanguage();
  const { challengeId, maskedTarget, channel, expiresAt } = route.params;
  const [code, setCode] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  const inputRef = useRef<TextInput>(null);
  useEffect(() => { const timer = setInterval(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000); return () => clearInterval(timer); }, []);
  const submit = async () => {
    if (loading || code.length !== CODE_LENGTH) return;
    setError(null); setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const result = await verifyLoginDevice({ challengeId, code, deviceId, deviceName: Platform.OS === "ios" ? "iPhone" : "Android Device", deviceType: "mobile", platform: Platform.OS, loginSource: "mobile", appVersion: "1.0.0" });
      if (!result.success) setError(result.message || uiMessage("verificationWrong"));
    } catch (err) { setError(err instanceof Error ? err.message : uiMessage("verificationFailed")); }
    finally { setLoading(false); }
  };
  const channelLabel = channel === "sms" ? "text message" : channel; const minutes = Math.floor(secondsLeft / 60); const seconds = String(secondsLeft % 60).padStart(2, "0");
  const footer = <View style={styles.footer}><SecurityShield width={18} height={18} /><Text style={styles.footerText}>{t("company")}</Text></View>;
  return <ReDomScreen footer={footer}><View style={styles.content}>
    <View style={styles.iconCircle}><SecurityShield width={34} height={34} /></View>
    <Text style={styles.title}>{uiMessage("verifyDevice")}</Text>
    <Text style={styles.subtitle}>{uiMessage("verificationSent", { channel: channelLabel, target: maskedTarget })}</Text>
    <Pressable onPress={() => inputRef.current?.focus()} disabled={loading} style={styles.codeRow}>{Array.from({ length: CODE_LENGTH }).map((_, index) => <View key={index} style={[styles.codeBox, index === code.length && styles.codeBoxActive]}><Text style={styles.codeDigit}>{code[index] || ""}</Text></View>)}</Pressable>
    <TextInput ref={inputRef} value={code} onChangeText={(value) => { setError(null); setCode(value.replace(/\D/g, "").slice(0, CODE_LENGTH)); }} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={CODE_LENGTH} editable={!loading} style={styles.hiddenInput} accessibilityLabel={uiMessage("verifyDevice")} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable onPress={() => void submit()} disabled={loading || code.length !== CODE_LENGTH} style={[styles.primaryButton, (loading || code.length !== CODE_LENGTH) && styles.disabled]}>{loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.primaryText}>{uiMessage("verify")}</Text>}</Pressable>
    <Text style={styles.expiry}>{secondsLeft > 0 ? uiMessage("expires", { time: `${minutes}:${seconds}` }) : uiMessage("expired")}</Text>
    <Pressable onPress={() => navigation.goBack()} disabled={loading} style={styles.backButton}><Text style={styles.backText}>{uiMessage("backLogin")}</Text></Pressable>
  </View></ReDomScreen>;
}
const styles = StyleSheet.create({ content: { flex: 1, width: "100%", justifyContent: "center", alignItems: "center", paddingVertical: 8 }, iconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#EAF2FF", alignItems: "center", justifyContent: "center", marginBottom: 20 }, title: { textAlign: "center", fontSize: 25, fontWeight: "800", color: "#1C1E21", marginBottom: 10 }, subtitle: { width: "100%", textAlign: "center", fontSize: 15, lineHeight: 23, color: "#65676B", marginBottom: 28 }, codeRow: { width: "100%", flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 8 }, codeBox: { flex: 1, maxWidth: 52, minWidth: 40, height: 52, borderWidth: 1.5, borderColor: "#CCD0D5", borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" }, codeBoxActive: { borderColor: BLUE, borderWidth: 2 }, codeDigit: { fontSize: 21, fontWeight: "700", color: "#1C1E21" }, hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 }, error: { textAlign: "center", color: "#E41E3F", fontSize: 14, lineHeight: 21, fontWeight: "600", marginTop: 12 }, primaryButton: { width: "100%", height: 54, borderRadius: 12, backgroundColor: BLUE, alignItems: "center", justifyContent: "center", marginTop: 20 }, disabled: { opacity: 0.55 }, primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" }, expiry: { textAlign: "center", color: "#65676B", fontSize: 13, marginTop: 16 }, backButton: { alignItems: "center", justifyContent: "center", marginTop: 18 }, backText: { color: "#65676B", fontSize: 14, fontWeight: "600" }, footer: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, footerText: { color: "#65676B", fontSize: 12 } });
