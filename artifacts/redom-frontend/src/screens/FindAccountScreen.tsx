import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import { ReDomScreen } from "../layout/ReDomScreen";
import { authService } from "../auth/service";
import { useLanguage } from "../i18n/LanguageProvider";
import type { RootStackParamList } from "../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "FindAccount">;
const BLUE = "#1877F2"; const TEXT = "#1C1E21"; const MUTED = "#65676B"; const BORDER = "#CCD0D5";

export function FindAccountScreen({ navigation }: Props) {
  const { t, uiMessage } = useLanguage();
  const [identifier, setIdentifier] = useState(""); const [loading, setLoading] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function submit() {
    if (loading) return;
    if (!identifier.trim()) { setMessage(uiMessage("findPrompt")); return; }
    setLoading(true); setMessage(null);
    try { const result = await authService.forgotPassword({ identifier: identifier.trim() }); setMessage(result.message || uiMessage("findFallback")); }
    catch (e) { setMessage(e instanceof Error ? e.message : uiMessage("findFailed")); }
    finally { setLoading(false); }
  }
  const footer = <View style={styles.footer}><ReDomLogo width={72} height={20} /><Text style={styles.company}>{t("company")}</Text></View>;
  return <ReDomScreen footer={footer}><View style={styles.content}>
    <ReDomLogo width={170} height={47} />
    <Text style={styles.title}>{t("findAccount")}</Text>
    <Text style={styles.subtitle}>{t("mobileOrEmail")}</Text>
    <TextInput value={identifier} onChangeText={setIdentifier} placeholder={t("mobileOrEmail")} placeholderTextColor="#8A8D91" autoCapitalize="none" autoCorrect={false} style={styles.input} editable={!loading} />
    {message ? <Text style={styles.message}>{message}</Text> : null}
    <Pressable onPress={() => void submit()} disabled={loading} style={styles.button}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{t("continue")}</Text>}</Pressable>
    <Pressable onPress={() => navigation.navigate("Login")} disabled={loading} style={styles.back}><Text style={styles.backText}>{uiMessage("backLogin")}</Text></Pressable>
  </View></ReDomScreen>;
}
const styles = StyleSheet.create({ content: { flex: 1, width: "100%", justifyContent: "center", alignItems: "center", paddingVertical: 8 }, title: { marginTop: 20, color: TEXT, fontSize: 25, fontWeight: "800", textAlign: "center" }, subtitle: { width: "100%", marginTop: 10, marginBottom: 22, color: MUTED, fontSize: 14, lineHeight: 22, textAlign: "center" }, input: { width: "100%", height: 54, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, color: TEXT }, message: { width: "100%", marginTop: 12, color: MUTED, fontSize: 13, lineHeight: 20, textAlign: "center" }, button: { width: "100%", height: 54, marginTop: 16, borderRadius: 12, backgroundColor: BLUE, alignItems: "center", justifyContent: "center" }, buttonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" }, back: { height: 48, justifyContent: "center", marginTop: 6 }, backText: { color: BLUE, fontWeight: "800" }, footer: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, company: { color: MUTED, fontSize: 12 } });
