import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { authService } from "../../auth/service";
import { getDeviceId } from "../../utils/device";
import type { RootStackParamList } from "../../routing/types";
import { registrationStyles as s } from "./registrationStyles";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationContact">;

export function RegistrationContactScreen({ navigation }: Props) {
  const [type, setType] = useState<"phone" | "email">("phone");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function next() {
    if (loading || !target.trim()) {
      setError(type === "phone" ? "Enter your mobile number." : "Enter your email address.");
      return;
    }
    setLoading(true); setError(null);
    try {
      const result = await authService.startRegistrationChallenge({
        contactType: type,
        target: target.trim(),
        deviceId: await getDeviceId(),
      });
      navigation.replace("RegistrationIdentity", result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start registration.");
    } finally { setLoading(false); }
  }

  return <ScrollView contentContainerStyle={s.scroll} style={s.screen} keyboardShouldPersistTaps="handled">
    <View style={s.card}>
      <Pressable onPress={() => navigation.goBack()}><Text style={s.back}>‹ Back to Login</Text></Pressable>
      <Text style={s.title}>Create your ReDom account</Text>
      <Text style={s.subtitle}>Start with the contact method ReDom will use to secure this registration.</Text>
      <View style={s.choiceRow}>
        {(["phone", "email"] as const).map((item) => <Pressable key={item} onPress={() => setType(item)} style={[s.choice, type === item && s.choiceActive]}><Text style={[s.choiceText, type === item && s.choiceTextActive]}>{item === "phone" ? "Mobile Number" : "Email"}</Text></Pressable>)}
      </View>
      <Text style={s.label}>{type === "phone" ? "Mobile Number" : "Email Address"}</Text>
      <TextInput value={target} onChangeText={setTarget} placeholder={type === "phone" ? "+234..." : "you@example.com"} placeholderTextColor="#8A93A3" keyboardType={type === "phone" ? "phone-pad" : "email-address"} autoCapitalize="none" style={s.input} editable={!loading} />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Pressable onPress={() => void next()} disabled={loading} style={s.button}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>Continue</Text>}</Pressable>
    </View>
  </ScrollView>;
}
