import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { messageService, type DisappearingTimer } from "../messages/messageService";
import { groupService } from "../messages/groupService";
import { searchService, type SearchResult } from "../search/searchService";
import { GroupActionIcon } from "../components/GroupActionIcon";

const timerOptions: Array<{ value: DisappearingTimer; label: string }> = [
  { value: 86400, label: "24 hours" }, { value: 604800, label: "7 days" }, { value: 7776000, label: "90 days" }, { value: 0, label: "Off" },
];

const tokenizeMembers = (value: string) => [...new Set(value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))];

export function CreateGroupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberIds, setMemberIds] = useState("");
  const [resolvedMembers, setResolvedMembers] = useState<SearchResult[]>([]);
  const [resolvingMembers, setResolvingMembers] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [timer, setTimer] = useState<DisappearingTimer>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const memberTokens = tokenizeMembers(memberIds);

  useEffect(() => {
    let cancelled = false;
    const tokens = tokenizeMembers(memberIds);
    if (!tokens.length) { setResolvedMembers([]); setResolvingMembers(false); return; }

    setResolvingMembers(true);
    const timerId = setTimeout(async () => {
      try {
        const matches = await Promise.all(tokens.map(async (token) => {
          try {
            const result = await searchService.search(token);
            const exact = result.results.find((candidate) =>
              candidate.profileId === token ||
              candidate.publicId === token ||
              candidate.username.toLowerCase() === token.replace(/^@/, "").toLowerCase(),
            );
            return exact ?? null;
          } catch {
            return null;
          }
        }));
        if (!cancelled) setResolvedMembers(matches.filter((item): item is SearchResult => item !== null));
      } finally {
        if (!cancelled) setResolvingMembers(false);
      }
    }, 250);

    return () => { cancelled = true; clearTimeout(timerId); };
  }, [memberIds]);

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

  const removeMember = (token: string) => {
    setMemberIds((value) => tokenizeMembers(value).filter((item) => item !== token).join(" "));
  };

  const create = async () => {
    if (!name.trim()) { setError("Enter a group name."); return; }
    if (resolvingMembers) { setError("Wait for ReDom to finish checking the members."); return; }
    if (memberTokens.length !== resolvedMembers.length) {
      setError("Each member must be a valid ReDom profile ID or username.");
      return;
    }

    setSaving(true); setError("");
    try {
      const memberUserIds = [...new Set(resolvedMembers.map((member) => member.userId))];
      const result = await messageService.createGroup(name.trim(), memberUserIds, description.trim() || undefined);
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
          <Pressable onPress={() => undefined} hitSlop={8} accessibilityLabel="Keyboard"><GroupActionIcon kind="keyboard" size={27} color="#98A2B3" /></Pressable>
        </View>

        <Pressable style={styles.row} onPress={chooseTimer}>
          <View style={styles.rowText}><Text style={styles.rowTitle}>Disappearing messages</Text><Text style={styles.rowSub}>{timerOptions.find((option) => option.value === timer)?.label || "Off"}</Text></View>
          <GroupActionIcon kind="history" size={30} color="#98A2B3" />
        </Pressable>
        <Pressable style={styles.row} onPress={showPermissions}>
          <Text style={styles.rowTitle}>Group permissions</Text><GroupActionIcon kind="settings" size={30} color="#667085" />
        </Pressable>

        <View style={styles.membersSection}>
          <Text style={styles.memberCount}>Members: {memberTokens.length}</Text>
          {memberTokens.length === 0 ? <Text style={styles.memberHint}>Add a ReDom profile ID or @username below</Text> : memberTokens.map((token) => {
            const resolved = resolvedMembers.find((member) => member.profileId === token || member.publicId === token || member.username.toLowerCase() === token.replace(/^@/, "").toLowerCase());
            return (
              <View key={token} style={styles.memberRow}>
                <View style={styles.memberAvatar}>{resolved?.profilePhoto ? <Image source={{ uri: resolved.profilePhoto }} style={styles.memberPhoto} /> : <GroupActionIcon kind="members" size={30} color="#1877F2" />}</View>
                <View style={styles.memberIdentity}>
                  <Text style={styles.memberName} numberOfLines={1}>{resolved ? `${resolved.firstName} ${resolved.lastName}`.trim() : token}</Text>
                  <Text style={styles.memberId} numberOfLines={1}>{resolved ? `@${resolved.username}` : token}</Text>
                </View>
                {resolved ? <GroupActionIcon kind="check" size={20} color="#1877F2" /> : resolvingMembers ? <ActivityIndicator size="small" /> : <GroupActionIcon kind="close" size={20} color="#B42318" />}
                <Pressable onPress={() => removeMember(token)} hitSlop={8}><GroupActionIcon kind="close" size={22} color="#667085" /></Pressable>
              </View>
            );
          })}
          <TextInput value={memberIds} onChangeText={setMemberIds} placeholder="Enter profile IDs or @usernames" placeholderTextColor="#98A2B3" style={styles.memberInput} autoCapitalize="none" autoCorrect={false} multiline />
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
  memberRow: { minHeight: 72, backgroundColor: "#FFF", paddingHorizontal: 32, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "#EEF0F2" },
  memberAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#EEF2F6", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  memberPhoto: { width: 50, height: 50 },
  memberIdentity: { flex: 1 },
  memberName: { fontSize: 15, color: "#101828", fontWeight: "600" },
  memberId: { fontSize: 13, color: "#667085", marginTop: 2 },
  memberInput: { margin: 18, minHeight: 72, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 14, color: "#101828", textAlignVertical: "top" },
  descriptionInput: { marginHorizontal: 18, minHeight: 72, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 14, color: "#101828", textAlignVertical: "top" },
  error: { margin: 18, color: "#B42318", fontWeight: "600" },
});