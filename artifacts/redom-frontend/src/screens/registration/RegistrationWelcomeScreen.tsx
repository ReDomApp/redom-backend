import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../../assets/brand/redom-logo.svg";
import World from "../../assets/auth/world.svg";
import { ReDomScreen } from "../../layout/ReDomScreen";
import { authService } from "../../auth/service";
import { getDeviceId } from "../../utils/device";
import type { RootStackParamList } from "../../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationWelcome">;
const BLUE = "#1877F2";
const TEXT = "#1C1E21";
const MUTED = "#65676B";

export function RegistrationWelcomeScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spin = useRef(new Animated.Value(0)).current;

  const createAccount = useCallback(async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    spin.setValue(0);
    const animation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 850, easing: Easing.linear, useNativeDriver: true }));
    animation.start();
    try {
      const reservation = await authService.reserveRegistrationFlow(await getDeviceId());
      animation.stop();
      navigation.replace("RegistrationIdentity", reservation);
    } catch (e) {
      animation.stop();
      setError(e instanceof Error ? e.message : "Unable to start account creation. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [loading, navigation, spin]);

  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const footer = (
    <View style={styles.footerContent}>
      <View style={styles.loginRow}>
        <Text style={styles.muted}>Already have an account? </Text>
        <Pressable onPress={() => navigation.navigate("Login")}><Text style={styles.link}>Login</Text></Pressable>
      </View>
      <View style={styles.legalRow}>
        <Pressable onPress={() => setError("Terms & Conditions will be available in the ReDom legal center.")}><Text style={styles.legal}>Terms & Conditions</Text></Pressable>
        <Text style={styles.separator}>•</Text>
        <Pressable onPress={() => setError("Privacy Policy will be available in the ReDom legal center.")}><Text style={styles.legal}>Privacy Policy</Text></Pressable>
        <Text style={styles.separator}>•</Text>
        <Pressable onPress={() => setError("Community Guidelines will be available in the ReDom legal center.")}><Text style={styles.legal}>Community Guidelines</Text></Pressable>
      </View>
      <View style={styles.companyRow}><ReDomLogo width={72} height={20} /><Text style={styles.company}>ReDom Platforms, Inc.</Text></View>
    </View>
  );

  return (
    <ReDomScreen footer={footer}>
      <View style={styles.content}>
        <View style={styles.logo}><ReDomLogo width={176} height={49} /></View>
        <Text style={styles.heading}>Join ReDom Today</Text>
        <View style={styles.descriptionRow}>
          <Text style={styles.description}>Create an account to connect with friends, family and communities of people who share your interests around the globe </Text>
          <World width={22} height={22} />
          <Text style={styles.description}>.</Text>
        </View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => void createAccount()} style={[styles.primaryButton, loading && styles.disabled]}>
          {loading ? <Animated.View style={{ transform: [{ rotate: rotation }] }}><ActivityIndicator size="small" color="#FFFFFF" /></Animated.View> : <Text style={styles.primaryText}>Create New Account</Text>}
        </Pressable>
        <Pressable disabled={loading} onPress={() => navigation.navigate("FindAccount")} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Find Your Account</Text>
        </Pressable>
        <View style={styles.progress} accessibilityLabel="Account creation progress, step 1 of 6">
          {[0, 1, 2, 3, 4, 5].map((step) => <View key={step} style={[styles.dot, step === 0 && styles.dotActive]} />)}
        </View>
      </View>
    </ReDomScreen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, width: "100%", justifyContent: "center", paddingVertical: 8 },
  logo: { alignItems: "center", marginBottom: 24 },
  heading: { textAlign: "center", color: TEXT, fontSize: 25, lineHeight: 31, fontWeight: "800", marginBottom: 13 },
  descriptionRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", marginBottom: 30 },
  description: { maxWidth: 520, textAlign: "center", color: MUTED, fontSize: 15, lineHeight: 23 },
  error: { color: "#E41E3F", textAlign: "center", fontSize: 13, lineHeight: 20, fontWeight: "600", marginBottom: 12 },
  primaryButton: { width: "100%", height: 54, borderRadius: 13, backgroundColor: BLUE, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  secondaryButton: { width: "100%", height: 54, marginTop: 12, borderRadius: 13, borderWidth: 2, borderColor: BLUE, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: BLUE, fontSize: 16, fontWeight: "800" },
  disabled: { opacity: 0.7 },
  progress: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 29 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#D8DCE1" },
  dotActive: { width: 24, backgroundColor: BLUE },
  footerContent: { width: "100%", alignItems: "center" },
  loginRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  muted: { color: MUTED, fontSize: 14 },
  link: { color: BLUE, fontSize: 14, fontWeight: "800" },
  legalRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: 7, marginTop: 14 },
  legal: { color: BLUE, fontSize: 11.5, fontWeight: "700" },
  separator: { color: "#8A8D91", fontSize: 11 },
  companyRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 9 },
  company: { color: MUTED, fontSize: 12 },
});
