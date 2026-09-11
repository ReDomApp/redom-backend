import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import PreparingIcon from "../assets/home-feed/preparing.svg";
import CustomizeIcon from "../assets/home-feed/customizing.svg";
import SessionIcon from "../assets/home-feed/session.svg";
import SecurityIcon from "../assets/home-feed/security.svg";
import FinishIcon from "../assets/home-feed/finishing.svg";
import ReadyIcon from "../assets/home-feed/ready.svg";
import { authService } from "../auth/service";
import { useAuthContext } from "../auth/context";
import { useLanguage } from "../i18n/LanguageProvider";
import { getDeviceId } from "../utils/device";
import type { RootStackParamList } from "../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "CustomizingExperience">;
const MINIMUM_MS = 36_000;
const STEP_MS = 6_000;
const STEPS = [
  { label: "Preparing ReDom", Icon: PreparingIcon },
  { label: "Customizing your experience", Icon: CustomizeIcon },
  { label: "Creating your session", Icon: SessionIcon },
  { label: "Securing your account", Icon: SecurityIcon },
  { label: "Preparing your Home Feed", Icon: FinishIcon },
  { label: "Finishing up", Icon: ReadyIcon },
];
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function CustomizingExperienceScreen({ route }: Props) {
  const { adoptSession } = useAuthContext();
  const { language } = useLanguage();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const spin = useRef(new Animated.Value(0)).current;
  const startedAt = useRef(Date.now());
  const current = STEPS[Math.min(step, STEPS.length - 1)];
  const Icon = current.Icon;
  const stepProgress = useMemo(() => Math.min(100, Math.round(((step + 1) / STEPS.length) * 100)), [step]);

  useEffect(() => {
    const animation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    animation.start();
    return () => animation.stop();
  }, [spin]);

  useEffect(() => {
    const timer = setInterval(() => setStep(value => Math.min(value + 1, STEPS.length - 1)), STEP_MS);
    return () => clearInterval(timer);
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;
    startedAt.current = Date.now();
    setStep(0);
    setError(null);
    async function initialize() {
      try {
        const deviceId = await getDeviceId();
        const response = await authService.initializeRegistration({
          verificationChallengeId: route.params.verificationChallengeId,
          flowId: route.params.flowId,
          reservationId: route.params.reservationId,
          deviceId,
          language,
          deviceType: "mobile",
          platform: "expo",
          loginSource: "registration",
        });
        const remaining = Math.max(0, MINIMUM_MS - (Date.now() - startedAt.current));
        await wait(remaining);
        if (cancelled) return;
        if (!response.success || !response.user || !response.session) throw new Error("Unable to finish account setup.");
        await adoptSession(response.user, response.session);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to finish account setup.");
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [adoptSession, attempt, language, route.params.flowId, route.params.reservationId, route.params.verificationChallengeId]);

  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <View style={styles.root}>
    <View style={styles.backgroundGlow} />
    <View style={styles.content}>
      <ReDomLogo width={174} height={50} />
      <Text style={styles.title}>Preparing your ReDom experience</Text>
      <Text style={styles.subtitle}>Please wait while we prepare your account, session, security and Home Feed.</Text>
      <View style={styles.card}>
        <View style={styles.iconWrap}><Icon width={54} height={54} /><Animated.View style={[styles.spinnerRing, { transform: [{ rotate: rotation }] }]}><View style={styles.spinnerArc} /></Animated.View></View>
        <Text style={styles.step}>{current.label}</Text>
        <Text style={styles.detail}>Setting up your account securely…</Text>
        <View style={styles.progressTrack}><View style={[styles.progress, { width: `${stepProgress}%` }]} /></View>
        <Text style={styles.progressText}>{stepProgress}%</Text>
        <ActivityIndicator size="small" />
      </View>
      {error ? <View style={styles.errorBox}><Text style={styles.errorTitle}>We couldn't finish preparing ReDom</Text><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => setAttempt(value => value + 1)} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View> : null}
      <Text style={styles.flow}>Flow ID: {route.params.flowId}</Text>
    </View>
    <View style={styles.footer}><Text style={styles.footerText}>ReDom Platforms, Inc.</Text><ReDomLogo width={70} height={20} /></View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F9FC", alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  backgroundGlow: { position: "absolute", width: 320, height: 320, borderRadius: 160, backgroundColor: "#EAF2FF", opacity: 0.85, top: "18%" },
  content: { width: "100%", maxWidth: 430, alignItems: "center" },
  title: { color: "#1C1E21", fontSize: 25, lineHeight: 31, fontWeight: "900", textAlign: "center", marginTop: 24 },
  subtitle: { color: "#65676B", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 9, maxWidth: 360 },
  card: { width: "100%", marginTop: 27, backgroundColor: "#FFFFFF", borderRadius: 24, padding: 28, alignItems: "center", borderWidth: 1, borderColor: "#E2E6EC", shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  iconWrap: { width: 74, height: 74, alignItems: "center", justifyContent: "center" },
  spinnerRing: { position: "absolute", width: 72, height: 72, borderRadius: 36 },
  spinnerArc: { position: "absolute", width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: "transparent", borderTopColor: "#1877F2" },
  step: { color: "#1C1E21", fontSize: 19, fontWeight: "900", textAlign: "center", marginTop: 18 },
  detail: { color: "#65676B", fontSize: 13, marginTop: 7 },
  progressTrack: { width: "100%", height: 6, borderRadius: 4, backgroundColor: "#E7EAF0", marginTop: 24, overflow: "hidden" },
  progress: { height: "100%", borderRadius: 4, backgroundColor: "#1877F2" },
  progressText: { color: "#65676B", fontSize: 12, fontWeight: "800", marginTop: 8, marginBottom: 14 },
  errorBox: { width: "100%", marginTop: 16, padding: 15, borderRadius: 16, backgroundColor: "#FFF1F3", borderWidth: 1, borderColor: "#FFD0D8" },
  errorTitle: { color: "#C81E3F", fontWeight: "900", textAlign: "center" },
  errorText: { color: "#5C1B27", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 5 },
  retry: { alignSelf: "center", marginTop: 10, paddingHorizontal: 20, height: 40, borderRadius: 20, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" },
  retryText: { color: "#FFF", fontSize: 13, fontWeight: "900" },
  flow: { color: "#1877F2", fontSize: 12, fontWeight: "900", marginTop: 20 },
  footer: { position: "absolute", bottom: 24, alignItems: "center", gap: 7 },
  footerText: { color: "#8A8D91", fontSize: 11 },
});
