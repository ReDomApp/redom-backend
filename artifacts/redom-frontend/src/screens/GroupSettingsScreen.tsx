import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { GroupActionIcon } from "../components/GroupActionIcon";
import { chatInfoService, type ChatInfoSettings } from "../messages/chatInfoService";
import { messageService, type ConversationSettings, type DisappearingTimer } from "../messages/messageService";

type Section = "storage" | "notifications" | "media" | "disappearing" | "lock" | "advanced";
type Props = NativeStackScreenProps<RootStackParamList, "GroupSettings">;

const timers: Array<{ value: DisappearingTimer; label: string }> = [
  { value: 86400, label: "24 hours" },
  { value: 604800, label: "7 days" },
  { value: 7776000, label: "90 days" },
  { value: 0, label: "Off" },
];

export function GroupSettingsScreen({ route, navigation }: Props) {
  const { conversationId, section } = route.params;
  const [chat, setChat] = useState<ChatInfoSettings | null>(null);
  const [messageSettings, setMessageSettings] = useState<ConversationSettings | null>(null);
  const [timer, setTimer] = useState<DisappearingTimer>(0);
  const [locked, setLocked] = useState(false);
  const [storageBytes, setStorageBytes] = useState(0);
  const [attachmentCount, setAttachmentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [info, msg, policy, lock] = await Promise.all([
        chatInfoService.getSettings(conversationId),
        messageService.getSettings(conversationId),
        messageService.getDisappearingPolicy(conversationId),
        chatInfoService.getChatLock(conversationId),
      ]);
      setChat(info.settings);
      setMessageSettings(msg.settings);
      setTimer(policy.timerSeconds);
      setLocked(lock);
      if (section === "storage") {
        const result = await messageService.getCompletedMessages(conversationId);
        let bytes = 0;
        let count = 0;
        for (const item of result.messages) {
          if (item.attachment?.fileSize) bytes += item.attachment.fileSize;
          if (item.attachment) count += 1;
        }
        setStorageBytes(bytes);
        setAttachmentCount(count);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load group setting.");
    } finally {
      setLoading(false);
    }
  }, [conversationId, section]);

  useEffect(() => { void load(); }, [load]);

  const updateChat = async (patch: Partial<ChatInfoSettings>) => {
    setSaving(true);
    try {
      const result = await chatInfoService.updateSettings(conversationId, patch);
      setChat(result.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setting could not be updated.");
    } finally { setSaving(false); }
  };

  const updateMessages = async (patch: Partial<ConversationSettings>) => {
    setSaving(true);
    try {
      const result = await messageService.updateSettings(conversationId, patch);
      setMessageSettings(result.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Notification setting could not be updated.");
    } finally { setSaving(false); }
  };

  const changeTimer = async (value: DisappearingTimer) => {
    setSaving(true);
    try {
      const result = await messageService.setDisappearingPolicy(conversationId, value);
      setTimer(result.timerSeconds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disappearing messages could not be updated.");
    } finally { setSaving(false); }
  };

  const changeLock = async (enabled: boolean) => {
    if (!enabled) {
      await chatInfoService.setChatLock(conversationId, false);
      setLocked(false);
      return;
    }
    try {
      if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) {
        Alert.alert("Device authentication required", "Set up a fingerprint, face or device passcode before locking this group.");
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirm ReDom group lock", fallbackLabel: "Use device passcode" });
      if (!result.success) return;
      await chatInfoService.setChatLock(conversationId, true);
      setLocked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat lock could not be changed.");
    }
  };

  const title = section === "storage" ? "Manage storage" : section === "notifications" ? "Notifications" : section === "media" ? "Media visibility" : section === "disappearing" ? "Disappearing messages" : section === "lock" ? "Chat lock" : "Advanced chat privacy";

  if (loading) return <SafeAreaView style={s.root}><ActivityIndicator style={{ marginTop: 48 }} size="large" color="#1877F2" /></SafeAreaView>;
  if (!chat || !messageSettings) return <SafeAreaView style={s.root}><Text style={s.error}>{error || "Group setting unavailable."}</Text></SafeAreaView>;

  return <SafeAreaView style={s.root}>
    <View style={s.header}><Pressable onPress={() => navigation.goBack()}><GroupActionIcon kind="back" size={30} color="#111" /></Pressable><Text style={s.headerTitle}>{title}</Text><View style={{ width: 30 }} /></View>
    <ScrollView contentContainerStyle={s.content}>
      {section === "storage" && <>
        <View style={s.intro}><GroupActionIcon kind="list" size={34} color="#667085" /><Text style={s.introTitle}>{formatBytes(storageBytes)}</Text><Text style={s.introText}>{attachmentCount} encrypted attachment{attachmentCount === 1 ? "" : "s"} indexed in this group.</Text></View>
        <Row icon="list" title="Media, links, and docs" subtitle="Open the encrypted group media gallery" onPress={() => navigation.navigate("ChatMediaGallery", { conversationId })} />
      </>}
      {section === "notifications" && <>
        <Text style={s.section}>Message</Text>
        <ToggleRow icon="settings" title="Notifications" subtitle="Allow notifications for this group." value={messageSettings.notificationsEnabled} onChange={value => void updateMessages({ notificationsEnabled: value })} />
        <ToggleRow icon="clear" title="Mute" subtitle="Silence this group on this device." value={messageSettings.muted} onChange={value => void updateMessages({ muted: value })} />
        <Row icon="list" title="Notify for" subtitle={messageSettings.mentionsOnly ? "Highlights" : "All"} onPress={() => void updateMessages({ mentionsOnly: !messageSettings.mentionsOnly })} />
        <Row icon="settings" title="Notification tone" subtitle={messageSettings.customNotificationSound || "Default"} />
        <Row icon="history" title="Vibrate" subtitle="Default" />
        <Text style={s.section}>Call</Text>
        <Text style={s.note}>ReDom currently uses the group's notification mute state for message and call delivery. Separate call-tone controls will be added when the call-notification backend is introduced.</Text>
      </>}
      {section === "media" && <>
        <View style={s.intro}><Text style={s.introTitle}>Media visibility</Text><Text style={s.introText}>Choose whether encrypted group media participates in this device's gallery workflow. ReDom never silently saves encrypted media.</Text></View>
        <ToggleRow icon="list" title="Media visibility" subtitle={chat.mediaVisibility ? "Private to this device" : "Not available in the device gallery workflow"} value={chat.mediaVisibility} onChange={value => void updateChat({ mediaVisibility: value })} />
      </>}
      {section === "disappearing" && <>
        <View style={s.intro}><GroupActionIcon kind="history" size={48} color="#667085" /><Text style={s.introTitle}>Make messages in this group disappear</Text><Text style={s.introText}>New messages use the selected timer. Kept messages remain available according to ReDom's message lifecycle rules.</Text></View>
        <Text style={s.section}>Message timer</Text>
        {timers.map(item => <Option key={item.value} label={item.label} selected={timer === item.value} onPress={() => void changeTimer(item.value)} />)}
      </>}
      {section === "lock" && <>
        <View style={s.intro}><GroupActionIcon kind="settings" size={44} color="#667085" /><Text style={s.introTitle}>Lock this group on this device</Text><Text style={s.introText}>Chat Lock is device-local. ReDom uses the device's enrolled biometric or device authentication and does not change conversation encryption.</Text></View>
        <ToggleRow icon="settings" title="Chat lock" subtitle={locked ? "Locked on this device" : "Lock and hide this group on this device"} value={locked} onChange={value => void changeLock(value)} />
      </>}
      {section === "advanced" && <>
        <View style={s.intro}><Text style={s.introTitle}>Advanced chat privacy</Text><Text style={s.introText}>When enabled, ReDom blocks forwarding outside this group and disables automatic ReDom AI chat-context sharing. Group changes are admin-authorized.</Text></View>
        <ToggleRow icon="settings" title="Advanced chat privacy" subtitle={chat.advancedChatPrivacy ? "On" : "Off"} value={chat.advancedChatPrivacy} onChange={value => void updateChat({ advancedChatPrivacy: value })} />
      </>}
      {saving ? <Text style={s.saving}>Saving…</Text> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}

function Row({ icon, title, subtitle, onPress }: { icon: any; title: string; subtitle?: string; onPress?: () => void }) { const body = <View style={s.row}><GroupActionIcon kind={icon} /><View style={{ flex: 1 }}><Text style={s.rowTitle}>{title}</Text>{subtitle ? <Text style={s.rowDesc}>{subtitle}</Text> : null}</View>{onPress ? <Text style={s.chev}>›</Text> : null}</View>; return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body; }
function ToggleRow({ icon, title, subtitle, value, onChange }: { icon: any; title: string; subtitle: string; value: boolean; onChange: (value: boolean) => void }) { return <View style={s.row}><GroupActionIcon kind={icon} /><View style={{ flex: 1 }}><Text style={s.rowTitle}>{title}</Text><Text style={s.rowDesc}>{subtitle}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: "#D0D5DD", true: "#22A96B" }} thumbColor="#FFF" /></View>; }
function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable style={s.option} onPress={onPress}><View style={[s.radio, selected && s.radioSelected]} /> <Text style={s.optionText}>{label}</Text></Pressable>; }
function formatBytes(bytes: number) { if (!bytes) return "0 B"; const units = ["B", "KB", "MB", "GB"]; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`; }

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: "#F7F8FA" }, header: { height: 64, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, headerTitle: { fontSize: 20, fontWeight: "700", color: "#111827" }, content: { paddingBottom: 50 }, intro: { backgroundColor: "#FFF", padding: 28, alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#E5E7EB" }, introTitle: { marginTop: 14, fontSize: 22, fontWeight: "700", color: "#101828", textAlign: "center" }, introText: { marginTop: 10, fontSize: 15, lineHeight: 22, color: "#667085", textAlign: "center" }, section: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: 9, fontSize: 15, color: "#667085" }, row: { minHeight: 76, backgroundColor: "#FFF", paddingHorizontal: 22, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 18, borderBottomWidth: 1, borderBottomColor: "#F0F2F5" }, rowTitle: { fontSize: 17, color: "#101828" }, rowDesc: { marginTop: 3, fontSize: 13, lineHeight: 18, color: "#667085" }, chev: { fontSize: 28, color: "#98A2B3" }, option: { minHeight: 64, backgroundColor: "#FFF", paddingHorizontal: 28, flexDirection: "row", alignItems: "center", gap: 18, borderBottomWidth: 1, borderBottomColor: "#F0F2F5" }, optionText: { fontSize: 17, color: "#101828" }, radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#98A2B3" }, radioSelected: { borderColor: "#22A96B", borderWidth: 7 }, note: { backgroundColor: "#FFF", padding: 22, color: "#667085", lineHeight: 21 }, saving: { padding: 16, textAlign: "center", color: "#667085" }, error: { padding: 22, color: "#B42318" } });