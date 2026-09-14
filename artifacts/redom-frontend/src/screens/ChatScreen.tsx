import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { messageService, type ConversationSettings, type ReDomMessage } from "../messages/messageService";
import { fadeIn, pressScale } from "../lib/animation";

export function ChatScreen({ route }: NativeStackScreenProps<RootStackParamList, "Chat">) {
  const navigation = useNavigation();
  const [messages, setMessages] = useState<ReDomMessage[]>([]);
  const [settings, setSettings] = useState<ConversationSettings | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const sendScale = useRef(new Animated.Value(1)).current;
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [r, s] = await Promise.all([messageService.getMessages(route.params.conversationId), messageService.getSettings(route.params.conversationId)]);
      setMessages(r.messages); setSettings(s.settings); await messageService.markRead(route.params.conversationId); fadeIn(opacity).start();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load this conversation."); } finally { setLoading(false); }
  }, [route.params.conversationId, opacity]);
  useEffect(() => { void load(); }, [load]);
  const send = async () => {
    const value = text.trim(); if (!value || sending) return;
    setSending(true); setError(""); pressScale(sendScale, true).start();
    try { const r = await messageService.sendText(route.params.conversationId, value); setMessages((current) => [...current, r.message]); setText(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Message could not be sent."); }
    finally { pressScale(sendScale, false).start(); setSending(false); }
  };
  const updateSetting = async (key: keyof ConversationSettings, value: boolean) => {
    if (!settings) return;
    const next = { ...settings, [key]: value } as ConversationSettings; setSettings(next);
    try { const r = await messageService.updateSettings(route.params.conversationId, { [key]: value }); setSettings(r.settings); }
    catch (e) { setSettings(settings); setError(e instanceof Error ? e.message : "Setting could not be updated."); }
  };
  return <SafeAreaView style={styles.root}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>Conversation</Text><Pressable onPress={() => setShowSettings((v) => !v)}><Text style={styles.more}>⋯</Text></Pressable></View>
      {showSettings && settings ? <View style={styles.settings}><Text style={styles.settingsTitle}>Conversation settings</Text><View style={styles.settingRow}><Text style={styles.settingText}>Notifications</Text><Switch value={settings.notificationsEnabled} onValueChange={(v) => void updateSetting("notificationsEnabled", v)} /></View><View style={styles.settingRow}><Text style={styles.settingText}>Mute</Text><Switch value={settings.muted} onValueChange={(v) => void updateSetting("muted", v)} /></View><View style={styles.settingRow}><Text style={styles.settingText}>Mentions only</Text><Switch value={settings.mentionsOnly} onValueChange={(v) => void updateSetting("mentionsOnly", v)} /></View></View> : null}
      {error ? <Pressable onPress={() => void load()} style={styles.error}><Text style={styles.errorText}>{error}  Tap to retry.</Text></Pressable> : null}
      {loading ? <View style={styles.center}><ActivityIndicator size="large" color="#1877F2" /></View> : <Animated.ScrollView style={{ opacity }} contentContainerStyle={styles.messages}>{messages.map((m) => <View key={m.id} style={styles.bubble}><Text style={styles.message}>{m.message || ""}</Text><Text style={styles.time}>{m.read ? "Read" : m.delivered ? "Delivered" : "Sent"} · {new Date(m.createdAt).toLocaleTimeString()}</Text></View>)}{!messages.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>Start the conversation</Text></View> : null}</Animated.ScrollView>}
      <View style={styles.composer}><TextInput value={text} onChangeText={setText} placeholder="Message" placeholderTextColor="#8A8D91" style={styles.input} multiline /><Animated.View style={{ transform: [{ scale: sendScale }] }}><Pressable onPress={() => void send()} disabled={!text.trim() || sending} style={[styles.send, (!text.trim() || sending) && styles.sendDisabled]}><Text style={styles.sendText}>Send</Text></Pressable></Animated.View></View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#F0F2F5" }, header: { height: 58, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E4E6EB", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 }, back: { fontSize: 38, color: "#1877F2" }, title: { fontSize: 19, fontWeight: "800", color: "#050505" }, more: { fontSize: 28, color: "#1877F2", width: 32, textAlign: "center" }, settings: { backgroundColor: "#FFF", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#E4E6EB" }, settingsTitle: { fontWeight: "800", fontSize: 15, marginBottom: 5, color: "#050505" }, settingRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, settingText: { fontSize: 15, color: "#050505" }, error: { backgroundColor: "#FFF1F1", padding: 10 }, errorText: { color: "#B42318", textAlign: "center", fontSize: 13 }, messages: { padding: 12, paddingBottom: 20 }, bubble: { alignSelf: "flex-end", maxWidth: "84%", backgroundColor: "#1877F2", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, marginBottom: 7 }, message: { color: "#FFF", fontSize: 15, lineHeight: 21 }, time: { color: "#DDEBFF", fontSize: 10, marginTop: 4 }, composer: { backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: "#E4E6EB", padding: 8, flexDirection: "row", alignItems: "flex-end" }, input: { flex: 1, maxHeight: 110, minHeight: 42, backgroundColor: "#F0F2F5", borderRadius: 21, paddingHorizontal: 15, paddingVertical: 10, color: "#050505" }, send: { marginLeft: 8, height: 42, borderRadius: 21, backgroundColor: "#1877F2", paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }, sendDisabled: { opacity: 0.45 }, sendText: { color: "#FFF", fontWeight: "800" }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, empty: { alignItems: "center", paddingTop: 80 }, emptyTitle: { fontSize: 18, fontWeight: "700", color: "#65676B" } });
