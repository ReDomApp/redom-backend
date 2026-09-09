import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { authService } from "../../auth/service";
import type { RootStackParamList } from "../../routing/types";
import { RegistrationFlowHeader } from "./RegistrationFlowHeader";
import { registrationStyles as s } from "./registrationStyles";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationUsername">;

export function RegistrationUsernameScreen({ navigation, route }: Props) {
  const { challengeId, flowId, maskedTarget, expiresAt } = route.params;
  const [username, setUsername] = useState(""); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  async function next() {
    const value = username.trim().toLowerCase();
    if (value.length < 3) return setError("Choose a username with at least 3 characters.");
    setLoading(true); setError(null);
    try { const result = await authService.saveRegistrationStep(challengeId, "username", { username: value }); navigation.replace("RegistrationProfile", { challengeId, flowId: result.flowId, maskedTarget, expiresAt: result.expiresAt }); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save username."); } finally { setLoading(false); }
  }
  return <ScrollView contentContainerStyle={s.scroll} style={s.screen}><View style={s.card}>
    <RegistrationFlowHeader flowId={flowId} expiresAt={expiresAt} />
    <Text style={s.title}>Choose your username</Text><Text style={s.subtitle}>This will become your ReDom @username.</Text>
    <Text style={s.label}>Username</Text><TextInput value={username} onChangeText={(v) => setUsername(v.replace(/\s/g, ""))} placeholder="@yourname" placeholderTextColor="#8A93A3" autoCapitalize="none" style={s.input} editable={!loading} />
    {error ? <Text style={s.error}>{error}</Text> : null}
    <Pressable onPress={() => void next()} disabled={loading} style={s.button}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>Continue</Text>}</Pressable>
  </View></ScrollView>;
}
