import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { authService } from "../../auth/service";
import type { RootStackParamList } from "../../routing/types";
import { RegistrationFlowHeader } from "./RegistrationFlowHeader";
import { registrationStyles as s } from "./registrationStyles";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationProfile">;

export function RegistrationProfileScreen({ navigation, route }: Props) {
  const { challengeId, flowId, maskedTarget, expiresAt } = route.params;
  const [dateOfBirth, setDateOfBirth] = useState(""); const [gender, setGender] = useState<"male" | "female" | "custom">("male"); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  async function next() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return setError("Use your date of birth in YYYY-MM-DD format.");
    setLoading(true); setError(null);
    try { const result = await authService.saveRegistrationStep(challengeId, "profile", { dateOfBirth, gender }); navigation.replace("RegistrationPassword", { challengeId, flowId: result.flowId, maskedTarget, expiresAt: result.expiresAt }); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save profile details."); } finally { setLoading(false); }
  }
  return <ScrollView contentContainerStyle={s.scroll} style={s.screen}><View style={s.card}>
    <RegistrationFlowHeader flowId={flowId} expiresAt={expiresAt} />
    <Text style={s.title}>A little about you</Text><Text style={s.subtitle}>These details are part of your account profile.</Text>
    <Text style={s.label}>Date of birth</Text><TextInput value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="YYYY-MM-DD" placeholderTextColor="#8A93A3" keyboardType="numbers-and-punctuation" style={s.input} editable={!loading} />
    <Text style={s.label}>Gender</Text><View style={s.choiceRow}>{(["male", "female", "custom"] as const).map((item) => <Pressable key={item} onPress={() => setGender(item)} style={[s.choice, gender === item && s.choiceActive]}><Text style={[s.choiceText, gender === item && s.choiceTextActive]}>{item[0].toUpperCase() + item.slice(1)}</Text></Pressable>)}</View>
    {error ? <Text style={s.error}>{error}</Text> : null}
    <Pressable onPress={() => void next()} disabled={loading} style={s.button}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>Continue</Text>}</Pressable>
  </View></ScrollView>;
}
