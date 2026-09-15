import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { messageService, type DisappearingTimer } from "../messages/messageService";
import { groupService } from "../messages/groupService";
import { GroupActionIcon } from "../components/GroupActionIcon";

const timerOptions: Array<{ value: DisappearingTimer; label: string }> = [
  { value: 86400, label: "24 hours" }, { value: 604800, label: "7 days" }, { value: 7776000, label: "90 days" }, { value: 0, label: "Off" },
];

export function CreateGroupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberIds, setMemberIds] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [timer, setTimer] = useState<DisappearingTimer>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const members = [...new Set(memberIds.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean))];

  const choosePhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert("Permission needed", "Allow ReDom to access photos to choose a group icon."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
      if (!result.canceled && result.assets[0]?.uri) setPhoto(result.assets[0].uri);
    } catch (e) { Alert.alert("Group icon", e instanceof Error ? e.message : "The group icon could not be selected."); }
  };

  const chooseTimer = () => Alert.alert("Disappearing messages", "All new messages in this group will disappear after the selected duration.", timerOptions.map((option) => ({ text: option.value === timer ? `✓ ${option.label}` : option.label, onPress: () => setTimer(option.value) })));

  const showPermissions = () => Alert.alert("Group permissions", "Members can edit group settings, send new messages, and add other members. Invite links and member approval remain controlled by group admins.");

  const create = async () => {
    if (!name.trim()) { setError("Enter a group name."); return; }
    if (members.some((id) => !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id))) { setError("Each member must use a valid ReDom profile ID."); return; }
    setSaving(true); setError("");
    try {
      const result = await messageService.createGroup(name.trim(), members, description.trim() || undefined);
      if (photo) await groupService.updatePhoto(result.conversationId, photo);
      if (timer !== 0) await messageService.setDisappearingPolicy(result.conversationId, timer);
      await groupService.updateSettings(result.conversationId, { anyoneCanEditInfo: true, anyoneCanInvite: true, anyoneCanSendMessages: true });
      navigation.replace("GroupInfo", { conversationId: result.conversationId });
    } catch (e) { setError(e instanceof Error ? e.message : "Group could not be created."); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}><GroupActionIcon kind="back" size={30} color="#111" /></Pressable>
        <Text style={styles.title}>New group</Text>
        <Pressable disabled={saving} onPress={() => void create()} style={styles.headerCheck} hitSlop={8}>
          {saving ? <ActivityIndicator color="#FFF" /> : <GroupActionIcon kind="check" size={26} color="#FFF" />}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.identityRow}>
          <Pressable style={styles.photoButton} onPress={() => void choosePhoto()}>
            {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : <GroupActionIcon kind="camera" size={34} color="#FFF" />}
          </Pressable>
          <View style={styles.nameBox}>
            <TextInput value={name} onChangeText={setName} placeholder="Group name" placeholderTextColor="#667085" style={styles.nameInput} maxLength={150} autoFocus />
          </View>
          <Pressable onPress={() => setName((value) => value)} hitSlop={8}><GroupActionIcon kind="emoji" size={27} color="#98A2B3" /></Pressable>
        </View>

        <Pressable style={styles.row} onPress={chooseTimer}>
          <View style={styles.rowText}><Text style={styles.rowTitle}>Disappearing messages</Text><Text style={styles.rowSub}>{timerOptions.find((option) => option.value === timer)?.label || "Off"}</Text></View>
          <GroupActionIcon kind="history" size={30} color="#98A2B3" />
        </Pressable>
        <Pressable style={styles.row} onPress={showPermissions}>
          <Text style={styles.rowTitle}>Group permissions</Text><GroupActionIcon kind="settings" size={30} color="#667085" />
        </Pressable>

        <View style={styles.membersSection}>
          <Text style={styles.memberCount}>Members: {members.length}</Text>
          {members.length === 0 ? <Text style={styles.memberHint}>Add member profile IDs below</Text> : members.map((id) => (
            <View key={id} style={styles.memberRow}>
              <View style={styles.memberAvatar}><GroupActionIcon kind="members" size={30} color="#1877F2" /></View>
              <Text style={styles.memberId} numberOfLines={1}>{id}</Text>
              <Pressable onPress={() => setMemberIds((value) => value.split(/[\s,]+/).filter((item) => item && item !== id).join(" "))} hitSlop={8}><GroupActionIcon kind="close" size={22} color="#667085" /></Pressable>
            </View>
          ))}
          <TextInput value={memberIds} onChangeText={setMemberIds} placeholder="Paste profile IDs separated by spaces or commas" placeholderTextColor="#98A2B3" style={styles.memberInput} autoCapitalize="none" autoCorrect={false} multiline />
          <TextInput value={description} onChangeText={setDescription} placeholder="Add group description (optional)" placeholderTextColor="#98A2B3" style={styles.descriptionInput} multiline maxLength={2000} />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F6F7" },
  header: { height: 64, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 20, fontWeight: "600", color: "#111827" },
  headerCheck: { width: 48, height: 48, borderRadius: 15, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  content: { paddingBottom: 40 },
  identityRow: { minHeight: 142, backgroundColor: "#FFF", paddingHorizontal: 32, paddingVertical: 22, flexDirection: "row", alignItems: "center", gap: 18, borderBottomWidth: 1, borderBottomColor: "#EEF0F2" },
  photoButton: { width: 88, height: 88, borderRadius: 44, backgroundColor: "#98A2B3", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  photo: { width: 88, height: 88 },
  nameBox: { flex: 1, height: 72, borderWidth: 1.5, borderColor: "#98A2B3", borderRadius: 15, justifyContent: "center" },
  nameInput: { fontSize: 22, color: "#111827", paddingHorizontal: 18 },
  row: { minHeight: 92, backgroundColor: "#FFF", paddingHorizontal: 32, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#EEF0F2" },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 18, color: "#101828" },
  rowSub: { fontSize: 15, color: "#667085", marginTop: 5 },
  membersSection: { marginTop: 1, backgroundColor: "#F5F6F7", paddingTop: 18 },
  memberCount: { paddingHorizontal: 32, fontSize: 16, color: "#667085", marginBottom: 10 },
  memberHint: { paddingHorizontal: 32, paddingVertical: 18, color: "#667085" },
  memberRow: { minHeight: 72, backgroundColor: "#FFF", paddingHorizontal: 32, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 1, borderBottomColor: "#EEF0F2" },
  memberAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#EEF2F6", alignItems: "center", justifyContent: "center" },
  memberId: { flex: 1, fontSize: 15, color: "#101828" },
  memberInput: { margin: 18, minHeight: 72, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 14, color: "#101828", textAlignVertical: "top" },
  descriptionInput: { marginHorizontal: 18, minHeight: 72, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 14, color: "#101828", textAlignVertical: "top" },
  error: { margin: 18, color: "#B42318", fontWeight: "600" },
});
