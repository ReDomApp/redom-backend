import { useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { messageService, type ReDomMessage } from "../messages/messageService";
import { reDomAiService, type ReDomAiTurn } from "../messages/reDomAiService";

interface Props {
  conversationId: string;
}

function contextFromMessages(messages: ReDomMessage[]): string {
  return messages
    .filter((message) => message.message && !message.deletedForEveryone && !message.deletedPlaceholder)
    .slice(-12)
    .map((message) => `[Chat participant] ${message.message}`)
    .join("\n");
}

export function ChatAiAssistant({ conversationId }: Props) {
  const [visible, setVisible] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ReDomAiTurn[]>([]);
  const [chatContext, setChatContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  const open = useCallback(async () => {
    setVisible(true);
    setError("");
    if (chatContext || opening) return;
    setOpening(true);
    try {
      const result = await messageService.getCompletedMessages(conversationId);
      setChatContext(contextFromMessages(result.messages));
    } catch {
      setChatContext("");
    } finally {
      setOpening(false);
    }
  }, [chatContext, conversationId, opening]);

  const close = () => {
    if (loading) return;
    setVisible(false);
    setInput("");
    setTurns([]);
    setError("");
  };

  const send = async () => {
    const message = input.trim();
    if (!message || loading) return;
    setInput("");
    setError("");
    setLoading(true);
    const history: ReDomAiTurn[] = [
      ...(chatContext ? [{ role: "user" as const, content: `Recent conversation context (reference only):\n${chatContext}` }] : []),
      ...turns,
    ];
    try {
      const response = await reDomAiService.chat(message, history);
      setTurns((current) => [...current, { role: "user", content: message }, { role: "assistant", content: response.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ReDom AI could not answer right now.");
      setInput(message);
    } finally {
      setLoading(false);
    }
  };

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Open ReDom AI" onPress={() => void open()} style={styles.aiButton}>
      <Text style={styles.aiText}>AI</Text>
    </Pressable>

    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.modalBackdrop}>
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <View><Text style={styles.title}>ReDom AI</Text><Text style={styles.subtitle}>General AI assistant · not ReDom Support</Text></View>
            <Pressable onPress={close} disabled={loading}><Text style={styles.close}>×</Text></Pressable>
          </View>
          {opening ? <View style={styles.loadingContext}><ActivityIndicator size="small" color="#1877F2" /><Text style={styles.loadingText}>Reading recent chat context…</Text></View> : null}
          <ScrollView style={styles.transcript} contentContainerStyle={styles.transcriptContent} keyboardShouldPersistTaps="handled">
            {!turns.length ? <View style={styles.welcome}><Text style={styles.welcomeTitle}>Ask me anything</Text><Text style={styles.welcomeText}>I can help with ideas, explanations, writing, coding, planning, translation, jokes and more. I’ll reply in the language you’re using.</Text></View> : null}
            {turns.map((turn, index) => <View key={`${turn.role}-${index}`} style={[styles.turn, turn.role === "user" ? styles.userTurn : styles.aiTurn]}><Text style={styles.turnLabel}>{turn.role === "user" ? "You" : "ReDom AI"}</Text><Text style={styles.turnText}>{turn.content}</Text></View>)}
            {loading ? <View style={[styles.turn, styles.aiTurn]}><ActivityIndicator size="small" color="#1877F2" /><Text style={styles.thinking}>Thinking…</Text></View> : null}
          </ScrollView>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.composer}>
            <TextInput value={input} onChangeText={setInput} onSubmitEditing={() => void send()} editable={!loading} placeholder="Ask ReDom AI…" placeholderTextColor="#8A8D91" style={styles.input} multiline maxLength={6000} />
            <Pressable onPress={() => void send()} disabled={!input.trim() || loading} style={[styles.send, (!input.trim() || loading) && styles.disabled]}><Text style={styles.sendText}>Send</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  aiButton: { position: "absolute", top: 66, right: 54, zIndex: 50, width: 38, height: 38, borderRadius: 19, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", elevation: 5, shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  aiText: { color: "#FFF", fontSize: 12, fontWeight: "900" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "flex-end" },
  panel: { height: "82%", backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" },
  panelHeader: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#E4E6EB", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 19, fontWeight: "900", color: "#050505" },
  subtitle: { marginTop: 3, fontSize: 11, color: "#65676B" },
  close: { fontSize: 30, color: "#65676B", paddingHorizontal: 5 },
  loadingContext: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 8, backgroundColor: "#F7F9FC" },
  loadingText: { color: "#65676B", fontSize: 12 },
  transcript: { flex: 1 },
  transcriptContent: { padding: 14, gap: 10 },
  welcome: { padding: 16, borderRadius: 16, backgroundColor: "#F0F2F5" },
  welcomeTitle: { fontSize: 18, fontWeight: "800", color: "#050505" },
  welcomeText: { marginTop: 6, color: "#65676B", lineHeight: 20 },
  turn: { maxWidth: "92%", borderRadius: 16, padding: 11 },
  userTurn: { alignSelf: "flex-end", backgroundColor: "#E8F1FF" },
  aiTurn: { alignSelf: "flex-start", backgroundColor: "#F0F2F5" },
  turnLabel: { fontSize: 10, fontWeight: "800", color: "#65676B", marginBottom: 3 },
  turnText: { fontSize: 15, lineHeight: 21, color: "#050505" },
  thinking: { marginTop: 5, color: "#65676B" },
  error: { color: "#B42318", backgroundColor: "#FFF1F1", paddingHorizontal: 14, paddingVertical: 8, fontSize: 12 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 7, padding: 10, borderTopWidth: 1, borderTopColor: "#E4E6EB" },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: "#F0F2F5", color: "#050505", paddingHorizontal: 15, paddingVertical: 10 },
  send: { height: 44, borderRadius: 22, backgroundColor: "#1877F2", paddingHorizontal: 15, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.45 },
  sendText: { color: "#FFF", fontWeight: "800" },
});
