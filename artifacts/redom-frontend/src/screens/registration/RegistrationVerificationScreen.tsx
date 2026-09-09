import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { authService } from "../../auth/service";
import type { RootStackParamList } from "../../routing/types";
import { RegistrationFlowHeader } from "./RegistrationFlowHeader";
import { registrationStyles as s } from "./registrationStyles";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationVerification">;

export function RegistrationVerificationScreen({ navigation, route }: Props) {
  const { challengeId, flowId, maskedTarget, expiresAt, verificationChallengeId, channel, codeLength } = route.params;
  const [code, setCode] = useState(""); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false); const [seconds, setSeconds] = useState(Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));

  useEffect(() => { const timer = setInterval(() => setSeconds(Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))), 1000); return () => clearInterval(timer); }, [expiresAt]);

  async function verify() {
    if (code.length !== codeLength) return setError(`Enter the ${codeLength}-digit code sent to ${maskedTarget}.`);
    if (seconds <= 0) return setError("This verification code has expired.");
    setLoading(true); setError(null);
    try { await authService.verifyRegistrationChallenge(challengeId, verificationChallengeId, code); navigation.replace("Login"); }
    catch (e) { setError(e instanceof Error ? e.message : "Verification failed."); } finally { setLoading(false); }
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0"); const ss = String(seconds % 60).padStart(2, "0");
  return <ScrollView contentContainerStyle={s.scroll} style={s.screen} keyboardShouldPersistTaps="handled"><View style={s.card}>
    <RegistrationFlowHeader flowId={flowId} expiresAt={expiresAt} />
    <Text style={s.title}>Verify your account</Text><Text style={s.subtitle}>Enter the {codeLength}-digit code sent by {channel.toUpperCase()} to {maskedTarget}.</Text>
    <TextInput value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, codeLength))} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={codeLength} style={[s.input, { textAlign: "center", letterSpacing: 8, fontSize: 24, fontWeight: "800" }]} editable={!loading && seconds > 0} />
    <Text style={{ textAlign: "center", color: seconds < 30 ? "#D9304F" : "#69758A", fontSize: 13, marginBottom: 12 }}>Code expires in {mm}:{ss}</Text>
    {error ? <Text style={s.error}>{error}</Text> : null}
    <Pressable onPress={() => void verify()} disabled={loading || seconds <= 0} style={s.button}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>Verify Account</Text>}</Pressable>
    <Text style={{ color: "#7A8496", fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: "center" }}>This verification challenge is bound to Flow ID {flowId}. Codes from another flow or another contact will not verify.</Text>
  </View></ScrollView>;
}
