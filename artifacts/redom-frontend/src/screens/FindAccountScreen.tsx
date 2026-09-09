import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import { authService } from "../auth/service";
import type { RootStackParamList } from "../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "FindAccount">;
const BLUE = "#1877F2";

export function FindAccountScreen({ navigation }: Props) {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit() {
    if (loading) return;
    if (!identifier.trim()) { setMessage("Enter your mobile number or email address."); return; }
    setLoading(true); setMessage(null);
    try {
      const result = await authService.forgotPassword({ identifier: identifier.trim() });
      setMessage(result.message || "If the account exists, recovery instructions have been sent.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to find your account."); }
    finally { setLoading(false); }
  }
  return <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"><View style={styles.card}><ReDomLogo width={170} height={47} /><Text style={styles.title}>Find Your Account</Text><Text style={styles.subtitle}>Enter the mobile number or email address connected to your ReDom account.</Text><TextInput value={identifier} onChangeText={setIdentifier} placeholder="Mobile Number or Email" placeholderTextColor="#8A8D91" autoCapitalize="none" autoCorrect={false} style={styles.input} editable={!loading} />{message ? <Text style={styles.message}>{message}</Text> : null}<Pressable onPress={() => void submit()} disabled={loading} style={styles.button}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Continue</Text>}</Pressable><Pressable onPress={() => navigation.navigate("Login")} disabled={loading} style={styles.back}><Text style={styles.backText}>Back to Login</Text></Pressable></View></ScrollView>;
}
const styles = StyleSheet.create({ scroll: { flexGrow: 1, justifyContent: "center", backgroundColor: "#F0F2F5", padding: 20 }, card: { width: "100%", maxWidth: 430, alignSelf: "center", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 22, padding: 30 }, title: { marginTop: 20, color: "#1C1E21", fontSize: 25, fontWeight: "800" }, subtitle: { marginTop: 10, marginBottom: 22, color: "#65676B", fontSize: 14, lineHeight: 22, textAlign: "center" }, input: { width: "100%", height: 54, borderWidth: 1, borderColor: "#CCD0D5", borderRadius: 12, paddingHorizontal: 16, fontSize: 16, color: "#1C1E21" }, message: { width: "100%", marginTop: 12, color: "#65676B", fontSize: 13, lineHeight: 20, textAlign: "center" }, button: { width: "100%", height: 54, marginTop: 16, borderRadius: 12, backgroundColor: BLUE, alignItems: "center", justifyContent: "center" }, buttonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" }, back: { height: 48, justifyContent: "center", marginTop: 6 }, backText: { color: BLUE, fontWeight: "800" } });
