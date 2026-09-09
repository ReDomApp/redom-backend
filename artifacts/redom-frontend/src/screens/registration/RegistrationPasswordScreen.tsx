import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { authService } from "../../auth/service";
import { validatePassword } from "../../auth/validation";
import type { RootStackParamList } from "../../routing/types";
import { RegistrationFlowHeader } from "./RegistrationFlowHeader";
import { registrationStyles as s } from "./registrationStyles";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationPassword">;

export function RegistrationPasswordScreen({ navigation, route }: Props) {
  const { challengeId, flowId, maskedTarget, expiresAt } = route.params;
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  async function next() {
    const validation = validatePassword(password);
    if (validation) return setError(validation);
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true); setError(null);
    try { const result = await authService.saveRegistrationStep(challengeId, "password", { password }); navigation.replace("RegistrationReview", { challengeId, flowId: result.flowId, maskedTarget, expiresAt: result.expiresAt }); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save password."); } finally { setLoading(false); }
  }
  return <ScrollView contentContainerStyle={s.scroll} style={s.screen}><View style={s.card}>
    <RegistrationFlowHeader flowId={flowId} expiresAt={expiresAt} />
    <Text style={s.title}>Protect your account</Text><Text style={s.subtitle}>Your password is hashed by the backend before it is stored with this Flow ID.</Text>
    <Text style={s.label}>Password</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry style={s.input} editable={!loading} />
    <Text style={s.label}>Confirm password</Text><TextInput value={confirm} onChangeText={setConfirm} secureTextEntry style={s.input} editable={!loading} />
    {error ? <Text style={s.error}>{error}</Text> : null}
    <Pressable onPress={() => void next()} disabled={loading} style={s.button}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>Continue</Text>}</Pressable>
  </View></ScrollView>;
}
