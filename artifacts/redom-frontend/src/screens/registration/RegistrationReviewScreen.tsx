import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { authService } from "../../auth/service";
import type { RootStackParamList } from "../../routing/types";
import { RegistrationFlowHeader } from "./RegistrationFlowHeader";
import { registrationStyles as s } from "./registrationStyles";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationReview">;

export function RegistrationReviewScreen({ navigation, route }: Props) {
  const { challengeId, flowId, maskedTarget, expiresAt } = route.params;
  const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  async function complete() {
    setLoading(true); setError(null);
    try {
      const result = await authService.completeRegistrationChallenge(challengeId);
      navigation.replace("RegistrationVerification", {
        challengeId: result.challengeId,
        flowId: result.flowId,
        maskedTarget: result.verification.maskedTarget,
        expiresAt: result.verification.expiresAt,
        verificationChallengeId: result.verification.challengeId,
        channel: result.verification.channel,
        codeLength: result.verification.codeLength,
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to complete registration."); }
    finally { setLoading(false); }
  }
  return <ScrollView contentContainerStyle={s.scroll} style={s.screen}><View style={s.card}>
    <RegistrationFlowHeader flowId={flowId} expiresAt={expiresAt} />
    <Text style={s.title}>Ready to verify</Text><Text style={s.subtitle}>ReDom will now send a verification code only to the contact bound to this Flow ID: {maskedTarget}.</Text>
    <View style={{ padding: 16, borderRadius: 12, backgroundColor: "#F3F7FF", marginBottom: 16 }}><Text style={{ color: "#3A465A", fontSize: 13, lineHeight: 20 }}>The backend will use the information already stored under this challenge. A different phone number or email cannot be substituted at this stage.</Text></View>
    {error ? <Text style={s.error}>{error}</Text> : null}
    <Pressable onPress={() => void complete()} disabled={loading} style={s.button}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>Send Verification Code</Text>}</Pressable>
  </View></ScrollView>;
}
