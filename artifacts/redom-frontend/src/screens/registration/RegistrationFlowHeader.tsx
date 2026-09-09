import { StyleSheet, Text, View } from "react-native";

import LockedKey from "../../assets/auth/locked-key.svg";

export function RegistrationFlowHeader({
  flowId,
  expiresAt,
}: {
  flowId: string;
  expiresAt: string;
}) {
  const expires = new Date(expiresAt).getTime();
  const remainingMinutes = Math.max(0, Math.ceil((expires - Date.now()) / 60000));

  return (
    <View style={styles.wrap}>
      <View style={styles.flowRow}>
        <LockedKey width={18} height={18} />
        <Text style={styles.flowText}>Flow ID: {flowId}</Text>
      </View>
      <Text style={styles.expiryText}>
        Secure registration flow · {remainingMinutes} min remaining
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 28,
  },
  flowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  flowText: {
    color: "#172033",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  expiryText: {
    color: "#748096",
    fontSize: 12,
    marginTop: 6,
    marginLeft: 26,
  },
});
