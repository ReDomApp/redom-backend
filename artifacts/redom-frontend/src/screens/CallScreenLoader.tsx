import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "Call">;
type CallComponent = (props: Props) => ReactNode;

export function CallScreenLoader(props: Props) {
  const [CallScreen, setCallScreen] = useState<CallComponent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void import("./CallScreen")
      .then((module) => {
        if (alive) setCallScreen(() => module.CallScreen as unknown as CallComponent);
      })
      .catch((reason) => {
        if (alive) {
          setError(reason instanceof Error ? reason.message : "The ReDom calling module is unavailable in this Expo client.");
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Calls unavailable</Text>
        <Text style={styles.message}>
          ReDom calling requires a native development build with WebRTC support. This Expo client does not include the WebRTC native module.
        </Text>
        <Text style={styles.detail}>{error}</Text>
      </View>
    );
  }

  if (!CallScreen) {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" />
        <Text style={styles.loading}>Opening ReDom call…</Text>
      </View>
    );
  }

  return <CallScreen {...props} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#FFFFFF" },
  title: { fontSize: 22, fontWeight: "800", color: "#111111", marginBottom: 12 },
  message: { fontSize: 15, lineHeight: 22, textAlign: "center", color: "#333333" },
  detail: { marginTop: 16, fontSize: 12, lineHeight: 18, textAlign: "center", color: "#777777" },
  loading: { marginTop: 12, fontSize: 14, color: "#555555" },
});
