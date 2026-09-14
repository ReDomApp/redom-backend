import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { reDomAiService, type ReDomAiTurn } from "../messages/reDomAiService";

export function GlobalReDomAiAssistant() {
  const [visible, setVisible] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ReDomAiTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const close = () => { if (loading) return; setVisible(false); setInput(""); setTurns([]); setError(""); };
  const send = async () => {
    const message = input.trim();
    if (!message || loading) return;
    setInput(""); setError(""); setLoading(true);
    try {
      const response = await reDomAiService.chat(message, turns);
      setTurns((current) => [...current, { role: "user", content: message }, { role: "assistant", content: response.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ReDom AI could not answer right now.");
      setInput(message);
    } finally { setLoading(false); }
  };

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Open ReDom AI" onPress={() => { setVisible(true); setError(""); }} style={styles.aiButton}><Text style={styles.aiText}>AI</Text></Pressable>
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}><View style={styles.panel}>
        <View style={styles.header}><View><Text style={styles.title}>ReDom AI</Text><Text style={styles.subtitle}>Global AI · current knowledge · same-language replies</Text></View><Pressable onPress={close} disabled={loading}><Text style={styles.close}>×</Text></Pressable></View>
        <ScrollView style={styles.transcript} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!turns.length ? <View style={styles.welcome}><Text style={styles.welcomeTitle}>Ask ReDom AI anything</Text><Text style={styles.welcomeText}>Questions, coding, writing, translation, planning, research, jokes and more. I can use current web information when useful and reply in the language you use.</Text></View> : null}
          {turns.map((turn, index) => <View key={`${turn.role}-${index}`} style={[styles.turn, turn.role === "user" ? styles.userTurn : styles.aiTurn]}><Text style={styles.label}>{turn.role === "user" ? "You" : "ReDom AI"}</Text><Text style={styles.turnText}>{turn.content}</Text></View>)}
          {loading ? <View style={[styles.turn, styles.aiTurn]}><ActivityIndicator size="small" color="#1877F2" /><Text style={styles.thinking}>Thinking…</Text></View> : null}
        </ScrollView>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.composer}><TextInput value={input} onChangeText={setInput} onSubmitEditing={() => void send()} editable={!loading} placeholder="Ask ReDom AI…" placeholderTextColor="#8A8D91" style={styles.input} multiline maxLength={6000} /><Pressable onPress={() => void send()} disabled={!input.trim() || loading} style={[styles.send, (!input.trim() || loading) && styles.disabled]}><Text style={styles.sendText}>Send</Text></Pressable></View>
      </View></View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  aiButton: { position: "absolute", top: 11, right: 62, zIndex: 100, width: 38, height: 38, borderRadius: 19, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  aiText: { color: "#FFF", fontSize: 12, fontWeight: "900" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  panel: { height: "82%", backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" },
  header: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#E4E6EB", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 20, fontWeight: "900", color: "#050505" }, subtitle: { marginTop: 3, fontSize: 11, color: "#65676B" }, close: { fontSize: 30, color: "#65676B", paddingHorizontal: 5 },
  transcript: { flex: 1 }, content: { padding: 14, gap: 10 }, welcome: { padding: 16, borderRadius: 16, backgroundColor: "#F0F2F5" }, welcomeTitle: { fontSize: 18, fontWeight: "800", color: "#050505" }, welcomeText: { marginTop: 6, color: "#65676B", lineHeight: 20 },
  turn: { maxWidth: "92%", borderRadius: 16, padding: 11 }, userTurn: { alignSelf: "flex-end", backgroundColor: "#E8F1FF" }, aiTurn: { alignSelf: "flex-start", backgroundColor: "#F0F2F5" }, label: { fontSize: 10, fontWeight: "800", color: "#65676B", marginBottom: 3 }, turnText: { fontSize: 15, lineHeight: 21, color: "#050505" }, thinking: { marginTop: 5, color: "#65676B" }, error: { color: "#B42318", backgroundColor: "#FFF1F1", paddingHorizontal: 14, paddingVertical: 8, fontSize: 12 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 7, padding: 10, borderTopWidth: 1, borderTopColor: "#E4E6EB" }, input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: "#F0F2F5", color: "#050505", paddingHorizontal: 15, paddingVertical: 10 }, send: { height: 44, borderRadius: 22, backgroundColor: "#1877F2", paddingHorizontal: 15, alignItems: "center", justifyContent: "center" }, disabled: { opacity: 0.45 }, sendText: { color: "#FFF", fontWeight: "800" },
});
