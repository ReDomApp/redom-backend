import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { authService } from "../../auth/service";
import type { RootStackParamList } from "../../routing/types";
import { RegistrationFlowHeader } from "./RegistrationFlowHeader";
import { registrationStyles as s } from "./registrationStyles";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationIdentity">;

export function RegistrationIdentityScreen({ navigation, route }: Props) {
  const { challengeId, flowId, maskedTarget, expiresAt } = route.params;
  const [firstName, setFirstName] = useState(""); const [lastName, setLastName] = useState(""); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  async function next() {
    if (firstName.trim().length < 2 || lastName.trim().length < 2) return setError("Enter your first and last name.");
    setLoading(true); setError(null);
    try { const result = await authService.saveRegistrationStep(challengeId, "identity", { firstName, lastName }); navigation.replace("RegistrationUsername", { challengeId, flowId: result.flowId, maskedTarget, expiresAt: result.expiresAt }); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save your name."); } finally { setLoading(false); }
  }
  return <ScrollView contentContainerStyle={s.scroll} style={s.screen}><View style={s.card}>
    <RegistrationFlowHeader flowId={flowId} expiresAt={expiresAt} />
    <Text style={s.title}>What should we call you?</Text><Text style={s.subtitle}>Your name is saved to this registration flow.</Text>
    <Text style={s.label}>First name</Text><TextInput value={firstName} onChangeText={setFirstName} style={s.input} autoCapitalize="words" editable={!loading} />
    <Text style={s.label}>Last name</Text><TextInput value={lastName} onChangeText={setLastName} style={s.input} autoCapitalize="words" editable={!loading} />
    {error ? <Text style={s.error}>{error}</Text> : null}
    <Pressable onPress={() => void next()} disabled={loading} style={s.button}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>Continue</Text>}</Pressable>
  </View></ScrollView>;
}
