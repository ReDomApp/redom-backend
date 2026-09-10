import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import StartupArtwork from "../assets/brand/startup.svg";
import WarningBlack from "../assets/auth/warning-black.svg";
import { fetchNetworkProvider, type NetworkProviderResponse } from "../auth/networkProvider";

function maskIp(ip: string | null) {
  if (!ip) return "Unavailable";
  if (ip.includes(":")) return `${ip.slice(0, 8)}••••••`;
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.•••••` : `${ip.slice(0, 6)}•••••`;
}

function titleFor(profile: NetworkProviderResponse) {
  if (!profile.security) return "ReDom Network Security Check";
  return profile.security.vpn || profile.security.datacenter
    ? "Your VPN Provider Terms and Conditions"
    : "Your Network Provider Terms and Conditions";
}

function warningFor(profile: NetworkProviderResponse) {
  if (profile.security?.vpn) return "VPN detected. Your current connection appears to be using a VPN provider.";
  if (profile.security?.datacenter) return "Datacenter connection detected. This connection appears to come from a hosting or cloud network.";
  if (profile.security?.proxy) return "Proxy detected. This connection appears to use a proxy.";
  if (profile.security?.tor) return "Tor detected. Please use your normal Internet connection to continue.";
  if (profile.security?.bot) return "Automated traffic detected. This connection was identified as automated traffic.";
  if (profile.security?.abuser || (profile.security?.fraudScore ?? 0) >= 75) return `High security risk detected. IPAPI assigned this connection a fraud-risk score of ${profile.security?.fraudScore ?? 0}%.`;
  return null;
}

export function StartupScreen({ onComplete }: { onComplete: () => void }) {
  const rotation = useRef(new Animated.Value(0)).current;
  const [profile, setProfile] = useState<NetworkProviderResponse | null>(null);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const completed = useRef(false);

  useEffect(() => {
    const animation = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: 950, easing: Easing.linear, useNativeDriver: true }));
    animation.start();
    return () => animation.stop();
  }, [rotation]);

  async function runNetworkCheck() {
    setChecking(true);
    setSecurityOpen(false);
    const result = await fetchNetworkProvider();
    setProfile(result);
    setChecking(false);
    setSecurityOpen(true);
  }

  useEffect(() => {
    void runNetworkCheck();
  }, []);

  const security = profile?.security;
  const warning = profile ? warningFor(profile) : null;
  const failed = Boolean(profile && (!profile.success || !security));
  const isVpnOrDatacenter = Boolean(security?.vpn || security?.datacenter);
  const termsTitle = titleFor(profile ?? { success: false, networkProvider: null, termsUrl: null, security: null, warning: null });

  function continueToLogin() {
    if (failed || !security || completed.current) return;
    setSecurityOpen(false);
    completed.current = true;
    onComplete();
  }

  return (
    <View style={styles.screen}>
      <View style={styles.artworkContainer}>
        <StartupArtwork width={343} height={768} />
        <Animated.View pointerEvents="none" style={[styles.spinner, { transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }]}>
          <View style={styles.spinnerTrack}><View style={styles.spinnerArc} /></View>
        </Animated.View>
      </View>

      <Modal visible={securityOpen} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.iconCircle}><WarningBlack width={30} height={30} /></View>
            <Text style={styles.title}>{termsTitle}</Text>
            <Text style={styles.subtitle}>
              {failed ? (profile?.warning ?? "We could not complete the IP/network security check.") : profile?.networkProvider ? `${profile.networkProvider} connection detected.` : "Your connection has been checked."}
            </Text>

            {warning ? <View style={styles.warning}><WarningBlack width={20} height={20} /><Text style={styles.warningText}>{warning}</Text></View> : null}

            {!failed ? <View style={styles.rows}>
              <View style={styles.row}><Text style={styles.label}>Your IP</Text><Text style={styles.value}>{maskIp(security?.ip ?? null)}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Connection</Text><Text style={styles.value}>{security?.connection ?? "Unknown"}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Provider</Text><Text style={styles.value}>{profile?.networkProvider ?? "Unknown"}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Location</Text><Text style={styles.value}>{[security?.city, security?.region, security?.country].filter(Boolean).join(", ") || "Unknown"}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Security score</Text><Text style={styles.value}>{security?.fraudScore ?? 0}%</Text></View>
            </View> : null}

            {isVpnOrDatacenter ? <Text style={styles.embeddedNotice}>Your connection type has been detected automatically. ReDom is showing this warning before the login screen because the current network is not a normal residential/mobile connection.</Text> : null}

            {!failed && profile?.termsUrl ? <Pressable onPress={() => void Linking.openURL(profile.termsUrl!)} style={styles.terms}><Text style={styles.termsText}>{termsTitle}</Text><Text style={styles.urlText}>{profile.termsUrl}</Text></Pressable> : null}

            {failed
              ? <Pressable onPress={() => void runNetworkCheck()} disabled={checking} style={styles.button}>{checking ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Retry Network Check</Text>}</Pressable>
              : <Pressable onPress={continueToLogin} style={styles.button}><Text style={styles.buttonText}>OK, Continue</Text></Pressable>}
            {checking ? <ActivityIndicator style={styles.providerIndicator} size="small" /> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  artworkContainer: { width: 343, height: 768, alignItems: "center", justifyContent: "center", position: "relative" },
  spinner: { position: "absolute", top: 277, left: 0, right: 0, height: 24, alignItems: "center", justifyContent: "center" },
  spinnerTrack: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center" },
  spinnerArc: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderTopColor: "#FFFFFF", borderRightColor: "transparent", borderBottomColor: "transparent", borderLeftColor: "transparent", position: "absolute" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.52)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, borderRadius: 18, backgroundColor: "#FFFFFF", padding: 22, elevation: 8 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "700", color: "#1C1E21", marginBottom: 6 },
  subtitle: { fontSize: 14, color: "#65676B", marginBottom: 14 },
  warning: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: "#FFF4E5", borderRadius: 12, padding: 12, marginBottom: 14 },
  warningText: { flex: 1, fontSize: 14, lineHeight: 20, color: "#7A4B00", fontWeight: "600" },
  rows: { borderTopWidth: 1, borderTopColor: "#E4E6EB" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 16, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#E4E6EB" },
  label: { color: "#65676B", fontSize: 14 },
  value: { color: "#1C1E21", fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  embeddedNotice: { marginTop: 12, fontSize: 12, lineHeight: 17, color: "#65676B" },
  terms: { marginTop: 14, padding: 12, borderWidth: 1, borderColor: "#CCD0D5", borderRadius: 10 },
  termsText: { color: "#1877F2", fontSize: 14, fontWeight: "700" },
  urlText: { color: "#65676B", fontSize: 11, marginTop: 4 },
  button: { marginTop: 16, backgroundColor: "#1877F2", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  providerIndicator: { marginTop: 10 },
});
