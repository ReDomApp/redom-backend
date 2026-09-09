import { useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAuthContext } from "../auth/context";
import { authService } from "../auth/service";
import { getDeviceId } from "../utils/device";
import type { RootStackParamList } from "../routing/types";
import SecurityShield from "../assets/auth/security-shield.svg";

const BLUE = "#1877F2";
const CODE_LENGTH = 6;

type Props = NativeStackScreenProps<RootStackParamList, "DeviceVerification">;

export function DeviceVerificationScreen({ route, navigation }: Props) {
  const { verifyLoginDevice } = useAuthContext();
  const { challengeId, maskedTarget, channel, expiresAt } = route.params;
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const remaining = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, remaining);
  });
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const submit = async () => {
    if (loading || code.length !== CODE_LENGTH) return;

    setError(null);
    setLoading(true);

    try {
      const deviceId = await getDeviceId();
      const result = await verifyLoginDevice({
        challengeId,
        code,
        deviceId,
        deviceName: Platform.OS === "ios" ? "iPhone" : "Android Device",
        deviceType: "mobile",
        platform: Platform.OS,
        loginSource: "mobile",
        appVersion: "1.0.0",
      });

      if (!result.success) {
        setError(result.message || "The verification code is incorrect.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (resending) return;
    setError(null);
    setResending(true);

    try {
      const result = await authService.resendLoginVerification({ challengeId });
      if (!result.success || !result.verification) {
        setError(result.message || "We could not send a new code.");
        return;
      }
      setSecondsLeft(Math.max(0, Math.ceil((new Date(result.verification.expiresAt).getTime() - Date.now()) / 1000)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not send a new code.");
    } finally {
      setResending(false);
    }
  };

  const channelLabel = channel === "sms" ? "text message" : channel;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <SecurityShield width={34} height={34} />
          </View>

          <Text style={styles.title}>Verify this device</Text>
          <Text style={styles.subtitle}>
            We sent a {channelLabel} to {maskedTarget}. Enter the verification code to finish signing in.
          </Text>

          <Pressable onPress={() => inputRef.current?.focus()} disabled={loading} style={styles.codeRow}>
            {Array.from({ length: CODE_LENGTH }).map((_, index) => (
              <View key={index} style={[styles.codeBox, index === code.length && styles.codeBoxActive]}>
                <Text style={styles.codeDigit}>{code[index] || ""}</Text>
              </View>
            ))}
          </Pressable>

          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={(value) => {
              setError(null);
              setCode(value.replace(/\D/g, "").slice(0, CODE_LENGTH));
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={CODE_LENGTH}
            editable={!loading}
            style={styles.hiddenInput}
            accessibilityLabel="Verification code"
          />

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={submit}
            disabled={loading || code.length !== CODE_LENGTH}
            style={[styles.primaryButton, (loading || code.length !== CODE_LENGTH) && styles.disabled]}
          >
            {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.primaryText}>Verify device</Text>}
          </Pressable>

          <Text style={styles.expiry}>
            {secondsLeft > 0 ? `Code expires in ${minutes}:${seconds}` : "This code has expired."}
          </Text>

          <Pressable onPress={resend} disabled={resending} style={styles.secondaryButton}>
            {resending ? <ActivityIndicator size="small" color={BLUE} /> : <Text style={styles.secondaryText}>Send a new code</Text>}
          </Pressable>

          <Pressable onPress={() => navigation.goBack()} disabled={loading} style={styles.backButton}>
            <Text style={styles.backText}>Back to Login</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F0F2F5" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 22, padding: 30, shadowColor: "#000000", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.08, shadowRadius: 30, elevation: 5 },
  iconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#EAF2FF", alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  title: { textAlign: "center", fontSize: 25, fontWeight: "800", color: "#1C1E21", marginBottom: 10 },
  subtitle: { textAlign: "center", fontSize: 15, lineHeight: 23, color: "#65676B", marginBottom: 28 },
  codeRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 8 },
  codeBox: { width: 43, height: 52, borderWidth: 1.5, borderColor: "#CCD0D5", borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  codeBoxActive: { borderColor: BLUE, borderWidth: 2 },
  codeDigit: { fontSize: 21, fontWeight: "700", color: "#1C1E21" },
  hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 },
  error: { textAlign: "center", color: "#E41E3F", fontSize: 14, lineHeight: 21, fontWeight: "600", marginTop: 12 },
  primaryButton: { height: 54, borderRadius: 12, backgroundColor: BLUE, alignItems: "center", justifyContent: "center", marginTop: 20 },
  disabled: { opacity: 0.55 },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  expiry: { textAlign: "center", color: "#65676B", fontSize: 13, marginTop: 16 },
  secondaryButton: { height: 50, alignItems: "center", justifyContent: "center", marginTop: 4 },
  secondaryText: { color: BLUE, fontSize: 15, fontWeight: "700" },
  backButton: { alignItems: "center", justifyContent: "center", marginTop: 10 },
  backText: { color: "#65676B", fontSize: 14, fontWeight: "600" },
});
