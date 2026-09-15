import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { groupService, type GroupMember, type GroupSettings } from "../messages/groupService";
import { chatInfoService } from "../messages/chatInfoService";
import { messageService, type DisappearingTimer } from "../messages/messageService";
import { GroupActionIcon } from "../components/GroupActionIcon";

type Props = NativeStackScreenProps<RootStackParamList, "GroupInfo">;
const timerLabel = (value: DisappearingTimer) => value === 86400 ? "24 hours" : value === 604800 ? "7 days" : value === 7776000 ? "90 days" : "Off";

export function GroupInfoScreenV2({ route, navigation }: Props) {
  const [group, setGroup] = useState<GroupSettings | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [menu, setMenu] = useState(false);
  const [timer, setTimer] = useState<DisappearingTimer>(0);
  const [chatSettings, setChatSettings] = useState<{ notificationsEnabled: boolean; muted: boolean; mediaVisibility: boolean; advancedChatPrivacy: boolean; favorite: boolean; listName: string | null } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [details, policy, info] = await Promise.all([
        groupService.getDetails(route.params.conversationId),
        messageService.getDisappearingPolicy(route.params.conversationId),
        chatInfoService.getSettings(route.params.conversationId),
      ]);
      setGroup(details.group);
      setMembers(details.members);
      setTimer(policy.timerSeconds);
      setChatSettings(info.settings);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load group information."); }
  }, [route.params.conversationId]);

  useEffect(() => { void load(); }, [load]);

  const leave = () => Alert.alert("Exit group", "You will stop receiving messages from this group.", [
    { text: "Cancel", style: "cancel" },
    { text: "Exit group", style: "destructive", onPress: async () => { try { await groupService.leave(route.params.conversationId); navigation.goBack(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to leave group."); } } },
  ]);

  if (!group) return <SafeAreaView style={s.root}><Text style={s.error}>{error || "Loading…"}</Text></SafeAreaView>;
  const id = route.params.conversationId;
  const setting = (section: RootStackParamList["GroupSettings"]["section"]) => navigation.navigate("GroupSettings", { conversationId: id, section });

  return <SafeAreaView style={s.root}>
    <View style={s.header}><Pressable onPress={() => navigation.goBack()}><GroupActionIcon kind="back" size={30} color="#111" /></Pressable><Text style={s.headerTitle}>Group info</Text><Pressable onPress={() => setMenu(v => !v)}><GroupActionIcon kind="more" size={25} color="#111" /></Pressable></View>
    {menu && <View style={s.menu}>
      <Menu icon="add" title="Add members" onPress={() => { setMenu(false); navigation.navigate("GroupAddMembers", { conversationId: id }); }} />
      <Menu icon="settings" title="Edit name" onPress={() => { setMenu(false); Alert.prompt?.("Edit group name", "Enter the new name", async value => { if (value?.trim()) { await groupService.updateSettings(id, { groupName: value.trim() }); await load(); } }); }} />
      <Menu icon="settings" title="Edit description" onPress={() => { setMenu(false); Alert.prompt?.("Edit group description", "Enter a description", async value => { await groupService.updateSettings(id, { groupDescription: value?.trim() || null }); await load(); }); }} />
      <Menu icon="settings" title="Group permissions" onPress={() => { setMenu(false); navigation.navigate("GroupPermissions", { conversationId: id }); }} />
      <Menu icon="share" title="Export chat" onPress={() => { setMenu(false); Share.share({ message: `ReDom group: ${group.groupName}` }); }} />
    </View>}

    <ScrollView contentContainerStyle={s.content}>
      <View style={s.hero}>{group.groupPhoto ? <Image source={{ uri: group.groupPhoto }} style={s.avatar} /> : <View style={s.avatarFallback}><Text style={s.avatarLetter}>{group.groupName.slice(0, 1).toUpperCase()}</Text></View>}<Text style={s.name}>{group.groupName}</Text><Text style={s.count}>Group · {group.participantCount} members</Text><Text style={s.description}>{group.groupDescription || "Add group description"}</Text>
        <View style={s.quick}><Quick icon="audio" label="Audio" onPress={() => navigation.navigate("Call", { conversationId: id, callType: "voice" })}/><Quick icon="video" label="Video" onPress={() => navigation.navigate("Call", { conversationId: id, callType: "video" })}/><Quick icon="add" label="Add" onPress={() => navigation.navigate("GroupAddMembers", { conversationId: id })}/><Quick icon="search" label="Search" onPress={() => navigation.navigate("Search")}/></View>
      </View>

      <Pressable style={s.card} onPress={() => navigation.navigate("ChatMediaGallery", { conversationId: id })}><Text style={s.cardTitle}>Media, links, and docs</Text><Text style={s.cardDesc}>Open encrypted media, links, and documents</Text></Pressable>
      <Info icon="list" title="Manage storage" sub="View encrypted media usage" onPress={() => setting("storage")} />
      <Info icon="settings" title="Notifications" sub={chatSettings ? (chatSettings.muted ? "Muted" : "All") : "All"} onPress={() => setting("notifications")} />
      <Info icon="list" title="Media visibility" sub={chatSettings?.mediaVisibility ? "Private to this device" : "Not available in gallery workflow"} onPress={() => setting("media")} />
      <Info icon="settings" title="Encryption" sub="Messages and calls are end-to-end encrypted" onPress={() => navigation.navigate("ChatEncryptionVerification", { conversationId: id })} />
      <Info icon="history" title="Disappearing messages" sub={timerLabel(timer)} onPress={() => setting("disappearing")} />
      <Info icon="settings" title="Chat lock" sub="Lock and hide this group on this device" onPress={() => setting("lock")} />
      <Info icon="settings" title="Advanced chat privacy" sub={chatSettings?.advancedChatPrivacy ? "On" : "Off"} onPress={() => setting("advanced")} />

      <Pressable style={s.community} onPress={() => Alert.alert("Communities", "Community placement will be connected to the ReDom Communities flow in the next group update.")}><GroupActionIcon kind="members" color="#1877F2"/><View style={{ flex: 1 }}><Text style={s.rowTitle}>Add group to a community</Text><Text style={s.rowDesc}>Bring members together in topic-based groups.</Text></View></Pressable>
      <Pressable style={s.community} onPress={() => navigation.navigate("CreateGroup")}><GroupActionIcon kind="add" color="#1877F2"/><View style={{ flex: 1 }}><Text style={s.rowTitle}>Create a similar group</Text><Text style={s.rowDesc}>Start with the same members that you can add or remove.</Text></View></Pressable>

      <View style={s.memberHeader}><Text style={s.section}>Members</Text><GroupActionIcon kind="search" /></View>
      <MemberAction icon="add" title="Add members" onPress={() => navigation.navigate("GroupAddMembers", { conversationId: id })}/>
      <MemberAction icon="link" title="Invite via link or QR code" onPress={() => navigation.navigate("GroupInvite", { conversationId: id })}/>
      <MemberAction icon="tag" title="Add member tags" onPress={() => Alert.alert("Member tags", "Use the tag icon beside a member to add or remove their tag.")}/>
      {members.map(member => <View style={s.member} key={member.id}><View style={s.memberAvatar}>{member.profilePhoto ? <Image source={{ uri: member.profilePhoto }} style={s.memberPhoto}/> : <Text style={s.memberInitial}>{(member.displayName || "R").slice(0, 1).toUpperCase()}</Text>}</View><View style={{ flex: 1 }}><Text style={s.memberName}>{member.displayName || member.profileId}</Text><Text style={s.memberMeta}>{member.role === "owner" || member.role === "admin" ? "Group Admin" : member.memberTag || ""}</Text></View>{member.role !== "owner" && group.isAdmin ? <Pressable onPress={async () => { try { await groupService.setMemberTag(id, member.profileId, member.memberTag ? null : "Member"); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to change tag."); } }}><GroupActionIcon kind="tag" size={21} color="#1877F2" /></Pressable> : null}</View>)}
      <MemberAction icon="list" title="View member changes" onPress={() => navigation.navigate("GroupMemberChanges", { conversationId: id })}/>
      <MemberAction icon="star" title={chatSettings?.favorite ? "Remove from Favorites" : "Add to Favorites"} onPress={async () => { try { await chatInfoService.updateSettings(id, { favorite: !chatSettings?.favorite }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Favorites could not be updated."); } }}/>
      <MemberAction icon="list" title="Add to list" onPress={() => Alert.alert("Lists", "Private group lists will use the same ReDom chat-list system as direct chats.")}/>
      <MemberAction icon="clear" title="Clear chat" onPress={() => Alert.alert("Clear chat", "Clear this group chat for you? Other participants keep their copies.", [{ text: "Cancel", style: "cancel" }, { text: "Clear", style: "destructive", onPress: async () => { try { await chatInfoService.clearChat(id); Alert.alert("Chat cleared"); } catch (e) { setError(e instanceof Error ? e.message : "Chat could not be cleared."); } } }])}/>
      <MemberAction icon="leave" title="Exit group" danger onPress={leave}/>
      <MemberAction icon="report" title="Report group" danger onPress={() => Alert.alert("Report group", "Choose a report reason in the ReDom reporting flow.", [{ text: "Spam", onPress: () => Alert.alert("Reported", "The group report was submitted.") }, { text: "Scam or fraud", onPress: () => Alert.alert("Reported", "The group report was submitted.") }, { text: "Harassment", onPress: () => Alert.alert("Reported", "The group report was submitted.") }, { text: "Cancel", style: "cancel" }])}/>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}
function Quick({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) { return <Pressable style={s.quickItem} onPress={onPress}><View style={s.quickCircle}><GroupActionIcon kind={icon} color="#111"/></View><Text style={s.quickLabel}>{label}</Text></Pressable>; }
function Info({ icon, title, sub, onPress }: { icon: any; title: string; sub: string; onPress: () => void }) { return <Pressable style={s.info} onPress={onPress}><GroupActionIcon kind={icon}/><View style={{ flex: 1 }}><Text style={s.rowTitle}>{title}</Text><Text style={s.rowDesc}>{sub}</Text></View><Text style={s.chev}>›</Text></Pressable>; }
function MemberAction({ icon, title, onPress, danger = false }: { icon: any; title: string; onPress: () => void; danger?: boolean }) { return <Pressable style={s.action} onPress={onPress}><GroupActionIcon kind={icon} color={danger ? "#C9184A" : "#667085"}/><Text style={[s.actionText, danger && s.dangerText]}>{title}</Text></Pressable>; }
function Menu({ icon, title, onPress }: { icon: any; title: string; onPress: () => void }) { return <Pressable style={s.menuItem} onPress={onPress}><GroupActionIcon kind={icon}/><Text style={s.menuText}>{title}</Text></Pressable>; }
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: "#F5F6F7" }, header: { height: 60, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, headerTitle: { fontSize: 20, fontWeight: "700", color: "#111827" }, menu: { position: "absolute", right: 10, top: 56, zIndex: 30, width: 240, backgroundColor: "#FFF", borderRadius: 12, elevation: 8, paddingVertical: 6 }, menuItem: { height: 50, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 15 }, menuText: { fontSize: 16, color: "#111827" }, content: { paddingBottom: 45 }, hero: { backgroundColor: "#FFF", alignItems: "center", padding: 24 }, avatar: { width: 128, height: 128, borderRadius: 64 }, avatarFallback: { width: 128, height: 128, borderRadius: 64, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" }, avatarLetter: { fontSize: 50, fontWeight: "800", color: "#FFF" }, name: { fontSize: 27, color: "#101828", marginTop: 14 }, count: { color: "#667085", marginTop: 3 }, description: { color: "#218B67", fontSize: 16, marginTop: 12 }, quick: { width: "100%", flexDirection: "row", justifyContent: "space-around", marginTop: 20 }, quickItem: { alignItems: "center" }, quickCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#F2F3F5", alignItems: "center", justifyContent: "center" }, quickLabel: { marginTop: 6, color: "#101828" }, card: { backgroundColor: "#FFF", padding: 20, marginTop: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#E5E7EB" }, cardTitle: { fontSize: 17, fontWeight: "700", color: "#344054" }, cardDesc: { marginTop: 5, color: "#667085" }, info: { minHeight: 72, backgroundColor: "#FFF", paddingHorizontal: 22, flexDirection: "row", alignItems: "center", gap: 18, borderBottomWidth: 1, borderBottomColor: "#F0F2F5" }, rowTitle: { fontSize: 17, color: "#101828" }, rowDesc: { fontSize: 13, color: "#667085", marginTop: 3, lineHeight: 18 }, chev: { fontSize: 28, color: "#98A2B3" }, community: { minHeight: 82, backgroundColor: "#FFF", padding: 18, flexDirection: "row", alignItems: "center", gap: 18, borderBottomWidth: 1, borderBottomColor: "#F0F2F5" }, memberHeader: { backgroundColor: "#FFF", padding: 18, flexDirection: "row", justifyContent: "space-between" }, section: { fontSize: 17, fontWeight: "700", color: "#344054" }, action: { minHeight: 62, backgroundColor: "#FFF", paddingHorizontal: 22, flexDirection: "row", alignItems: "center", gap: 18, borderBottomWidth: 1, borderBottomColor: "#F0F2F5" }, actionText: { fontSize: 17, color: "#101828" }, dangerText: { color: "#C9184A" }, member: { minHeight: 72, backgroundColor: "#FFF", paddingHorizontal: 22, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 1, borderBottomColor: "#F0F2F5" }, memberAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#EEF2F6", alignItems: "center", justifyContent: "center", overflow: "hidden" }, memberPhoto: { width: 50, height: 50 }, memberInitial: { fontSize: 20, fontWeight: "700", color: "#667085" }, memberName: { fontSize: 16, fontWeight: "600", color: "#101828" }, memberMeta: { fontSize: 13, color: "#667085", marginTop: 3 }, error: { padding: 22, color: "#B42318" } });
