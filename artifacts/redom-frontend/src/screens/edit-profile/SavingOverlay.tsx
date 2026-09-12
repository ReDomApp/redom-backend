import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";

export function SavingOverlay({ visible }: { visible: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color="#1877F2" />
          <Text style={styles.text}>Saving...</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)", alignItems: "center", justifyContent: "center" },
  card: { width: 132, minHeight: 126, borderRadius: 14, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 18, elevation: 8, shadowColor: "#000", shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  text: { marginTop: 14, fontSize: 16, fontWeight: "800", color: "#050505" },
});
