import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import ForwardIcon from "../assets/message-actions/forward.svg";
import ProfileIcon from "../assets/message-actions/profile.svg";
import type { ConversationSummary, ReDomMessage } from "../messages/messageService";
import { messageService } from "../messages/messageService";
import { forwardMessageService } from "../messages/forwardMessageService";

interface Props {
  visible: boolean;
  message: ReDomMessage | null;
  sourceConversationId: string;
  onClose: () => void;
  onComplete?: () => void;
}

export function ForwardMessageSheet({ visible, message, sourceConversationId, onClose, onComplete }: Props) {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setSelected([]); setQuery(""); setError(""); setLoading(true);
    void messageService.listConversations().then((result) => setItems(result.conversations.filter((item) => item.id !== sourceConversationId))).catch((e) => setError(e instanceof Error ? e.message : "Unable to load chats.")).finally(() => setLoading(false));
  }, [visible, sourceConversationId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.displayName || ""} ${item.groupName || ""}`.toLowerCase().includes(needle));
  }, [items, query]);

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length >= 5 ? current : [...current, id]);

  const send = async () => {
    if (!message || !selected.length || sending) return;
    setSending(true); setError("");
    try {
      await forwardMessageService.forwardText(message, selected);
      onClose(); onComplete?.();
    } catch (e) { setError(e instanceof Error ? e.message : "The message could not be forwarded."); }
    finally { setSending(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <ForwardIcon width={25} height={25} />
            <Text style={styles.title}>Forward message</Text>
            <Text style={styles.count}>{selected.length}/5</Text>
          </View>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search chats" placeholderTextColor="#65676B" style={styles.search} autoCapitalize="none" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loading ? <View style={styles.center}><ActivityIndicator /></View> : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.list}
              ListEmptyComponent={<Text style={styles.empty}>No chats found.</Text>}
              renderItem={({ item }) => {
                const checked = selected.includes(item.id);
                return <Pressable onPress={() => toggle(item.id)} style={styles.row}>
                  <View style={styles.iconBox}><ProfileIcon width={23} height={23} /></View>
                  <View style={styles.info}><Text numberOfLines={1} style={styles.name}>{item.groupName || item.displayName || "ReDom chat"}</Text><Text style={styles.type}>{item.type === "group" ? "Group chat" : "Chat"}</Text></View>
                  <View style={[styles.check, checked && styles.checked]}>{checked ? <Text style={styles.checkmark}>✓</Text> : null}</View>
                </Pressable>;
              }}
            />
          )}
          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Pressable disabled={!selected.length || sending} onPress={() => void send()} style={[styles.send, (!selected.length || sending) && styles.disabled]}><Text style={styles.sendText}>{sending ? "Sending…" : `Send${selected.length ? ` (${selected.length})` : ""}`}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.32)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#FFF", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 10, paddingBottom: 18, maxHeight: "88%" },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "#CCD0D5", marginBottom: 10 },
  header: { minHeight: 48, paddingHorizontal: 18, flexDirection: "row", alignItems: "center" },
  title: { flex: 1, marginLeft: 10, fontSize: 20, fontWeight: "800", color: "#050505" },
  count: { color: "#1877F2", fontWeight: "800", fontSize: 14 },
  search: { marginHorizontal: 16, marginBottom: 8, backgroundColor: "#F0F2F5", borderRadius: 12, minHeight: 44, paddingHorizontal: 14, fontSize: 16, color: "#050505" },
  list: { paddingBottom: 8 },
  row: { minHeight: 66, paddingHorizontal: 16, flexDirection: "row", alignItems: "center" },
  iconBox: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center" },
  info: { flex: 1, marginLeft: 12 },
  name: { fontSize: 16, fontWeight: "700", color: "#050505" },
  type: { marginTop: 3, fontSize: 13, color: "#65676B" },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: "#CCD0D5", alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: "#1877F2", borderColor: "#1877F2" },
  checkmark: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  cancel: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center" },
  cancelText: { color: "#1877F2", fontSize: 16, fontWeight: "800" },
  send: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" },
  sendText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  error: { marginHorizontal: 16, marginBottom: 6, color: "#B42318", fontSize: 13 },
  center: { minHeight: 240, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", color: "#65676B", paddingVertical: 40 },
});
