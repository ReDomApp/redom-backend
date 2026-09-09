import { StyleSheet } from "react-native";

export const registrationStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FA" },
  scroll: { flexGrow: 1, padding: 22, justifyContent: "center" },
  card: { width: "100%", maxWidth: 430, alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 20, padding: 28, shadowColor: "#000000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.07, shadowRadius: 28, elevation: 5 },
  back: { color: "#1769FF", fontSize: 14, fontWeight: "700", marginBottom: 18 },
  title: { color: "#182033", fontSize: 25, lineHeight: 31, fontWeight: "800", marginBottom: 8 },
  subtitle: { color: "#69758A", fontSize: 14, lineHeight: 21, marginBottom: 22 },
  label: { color: "#293246", fontSize: 13, fontWeight: "700", marginBottom: 7 },
  input: { height: 54, borderWidth: 1, borderColor: "#D6DBE4", borderRadius: 12, paddingHorizontal: 16, color: "#182033", fontSize: 16, backgroundColor: "#FFFFFF", marginBottom: 15 },
  button: { height: 54, borderRadius: 12, backgroundColor: "#1769FF", alignItems: "center", justifyContent: "center", marginTop: 8 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  outline: { height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: "#1769FF", alignItems: "center", justifyContent: "center", marginTop: 12 },
  outlineText: { color: "#1769FF", fontSize: 15, fontWeight: "800" },
  error: { color: "#D9304F", fontSize: 13, lineHeight: 20, fontWeight: "600", marginBottom: 12 },
  choiceRow: { flexDirection: "row", gap: 10, marginBottom: 15 },
  choice: { flex: 1, height: 48, borderWidth: 1, borderColor: "#D6DBE4", borderRadius: 11, alignItems: "center", justifyContent: "center" },
  choiceActive: { borderColor: "#1769FF", backgroundColor: "#EEF5FF" },
  choiceText: { color: "#4B5669", fontSize: 14, fontWeight: "700" },
  choiceTextActive: { color: "#1769FF" },
});
