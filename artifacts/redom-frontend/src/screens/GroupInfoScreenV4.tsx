import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { groupService, type GroupMember, type GroupSettings } from "../messages/groupService";
import { chatInfoService } from "../messages/chatInfoService";
import { messageService, type DisappearingTimer } from "../messages/messageService";
import { GroupActionIcon } from "../components/GroupActionIcon";

type Props = NativeStackScreenProps<RootStackParamList, "GroupInfo">;

type GroupSettingsSection = RootStackParamList["GroupSettings"]["section"];

const timerLabel = (value: DisappearingTimer) => {
  if (value === 86400) return "24 hours";
  if (value === 604800) return "7 days";
  if (value === 7776000) return "90 days";
  return "Off";
};

export function GroupInfoScreenV4({ route, navigation }: Props) {
  const [group, setGroup] = useState<GroupSettings | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [menu, setMenu] = useState(false);
  const [timer, setTimer] = useState<DisappearingTimer>(0);
  const [chatSettings, setChatSettings] = useState<any>(null);
  const [error, setError] = useState("");
  const id = route.params.conversationId;

  const load = useCallback(async () => {
    try {
      setError("");
      const [details, disappearing, info] = await Promise.all([
        groupService.getDetails(id),
        messageService.getDisappearingPolicy(id),
        chatInfoService.getSettings(id),
      ]);
      setGroup(details.group);
      setMembers(details.members);
      setTimer(disappearing.timerSeconds);
      setChatSettings(info.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load group information.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const leave = () => {
    Alert.alert(
      "Exit group",
      "You will stop receiving messages from this group.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Exit group",
          style: "destructive",
          onPress: async () => {
            try {
              await groupService.leave(id);
              navigation.goBack();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to leave group.");
            }
          },
        },
      ],
    );
  };

  const editGroupName = () => {
    setMenu(false);
    if (typeof Alert.prompt !== "function") {
      Alert.alert("Edit group name", "This action is not available on this device.");
      return;
    }
    Alert.prompt("Edit group name", "Enter the new name", async (value) => {
      const nextName = value?.trim();
      if (!nextName) return;
      try {
        await groupService.updateSettings(id, { groupName: nextName });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to update group name.");
      }
    });
  };

  const editGroupDescription = () => {
    setMenu(false);
    if (typeof Alert.prompt !== "function") {
      Alert.alert("Edit group description", "This action is not available on this device.");
      return;
    }
    Alert.prompt("Edit group description", "Enter a description", async (value) => {
      try {
        await groupService.updateSettings(id, {
          groupDescription: value?.trim() || null,
        });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to update group description.");
      }
    });
  };

  const setting = (section: GroupSettingsSection) => {
    navigation.navigate("GroupSettings", { conversationId: id, section });
  };

  if (!group) {
    return (
      <SafeAreaView style={s.root}>
        <Text style={s.error}>{error || "Loading…"}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <GroupActionIcon kind="back" size={30} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>Group info</Text>
        <Pressable onPress={() => setMenu((value) => !value)} hitSlop={8}>
          <GroupActionIcon kind="more" size={25} color="#111" />
        </Pressable>
      </View>

      {menu ? (
        <View style={s.menu}>
          <Menu
            icon="add"
            title="Add members"
            onPress={() => {
              setMenu(false);
              navigation.navigate("GroupAddMembers", { conversationId: id });
            }}
           styles={s}/>
          <Menu icon="edit" title="Edit name" onPress={editGroupName}  styles={s}/>
          <Menu icon="edit" title="Edit description" onPress={editGroupDescription}  styles={s}/>
          <Menu
            icon="settings"
            title="Group permissions"
            onPress={() => {
              setMenu(false);
              navigation.navigate("GroupPermissions", { conversationId: id });
            }}
           styles={s}/>
          <Menu
            icon="share"
            title="Export chat"
            onPress={() => {
              setMenu(false);
              void Share.share({ message: `ReDom group: ${group.groupName}` });
            }}
           styles={s}/>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={s.content}>
        <Pressable
          style={s.hero}
          onPress={() => navigation.navigate("GroupIcon", { conversationId: id })}
        >
          {group.groupPhoto ? (
            <Image source={{ uri: group.groupPhoto }} style={s.avatar} />
          ) : (
            <View style={s.avatarFallback}>
              <Text style={s.avatarLetter}>{group.groupName.slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
          <Text style={s.name}>{group.groupName}</Text>
          <Text style={s.count}>Group · {group.participantCount} members</Text>
          <Text style={s.description}>{group.groupDescription || "Add group description"}</Text>

          <View style={s.quick}>
            <Quick
              icon="audio"
              label="Audio"
              onPress={() => navigation.navigate("Call", { conversationId: id, callType: "voice" })}
             styles={s}/>
            <Quick
              icon="video"
              label="Video"
              onPress={() => navigation.navigate("Call", { conversationId: id, callType: "video" })}
             styles={s}/>
            <Quick
              icon="add"
              label="Add"
              onPress={() => navigation.navigate("GroupAddMembers", { conversationId: id })}
             styles={s}/>
            <Quick icon="search" label="Search" onPress={() => navigation.navigate("Search")}  styles={s}/>
          </View>
        </Pressable>

        <Pressable
          style={s.info}
          onPress={() => navigation.navigate("ChatMediaGallery", { conversationId: id })}
        >
          <GroupActionIcon kind="image" size={26} />
          <View style={s.flex}>
            <Text style={s.rowTitle}>Media, links, and docs</Text>
            <Text style={s.rowDesc}>Open encrypted media, links, and documents</Text>
          </View>
          <GroupActionIcon kind="chevron" color="#98A2B3" />
        </Pressable>

        <Info icon="list" title="Manage storage" sub="View encrypted media usage" onPress={() => setting("storage")}  styles={s}/>
        <Info
          icon="settings"
          title="Notifications"
          sub={chatSettings?.muted ? "Muted" : "All"}
          onPress={() => setting("notifications")}
         styles={s}/>
        <Info
          icon="image"
          title="Media visibility"
          sub={chatSettings?.mediaVisibility ? "Private to this device" : "Not available in gallery workflow"}
          onPress={() => setting("media")}
         styles={s}/>
        <Info
          icon="privacy"
          title="Encryption"
          sub="Messages and calls are end-to-end encrypted"
          onPress={() => navigation.navigate("ChatEncryptionVerification", { conversationId: id })}
         styles={s}/>
        <Info
          icon="history"
          title="Disappearing messages"
          sub={timerLabel(timer)}
          onPress={() => setting("disappearing")}
         styles={s}/>
        <Info
          icon="privacy"
          title="Chat lock"
          sub="Lock and hide this group on this device"
          onPress={() => setting("lock")}
         styles={s}/>
        <Info
          icon="privacy"
          title="Advanced chat privacy"
          sub={chatSettings?.advancedChatPrivacy ? "On" : "Off"}
          onPress={() => setting("advanced")}
         styles={s}/>

        <Pressable
          style={s.info}
          onPress={() => Alert.alert("Communities", "Community placement is not enabled for this group yet.")}
        >
          <GroupActionIcon kind="members" color="#1877F2" />
          <View style={s.flex}>
            <Text style={s.rowTitle}>Add group to a community</Text>
            <Text style={s.rowDesc}>Bring members together in topic-based groups.</Text>
          </View>
          <GroupActionIcon kind="chevron" color="#98A2B3" />
        </Pressable>

        <Pressable style={s.info} onPress={() => navigation.navigate("CreateGroup")}>
          <GroupActionIcon kind="add" color="#1877F2" />
          <View style={s.flex}>
            <Text style={s.rowTitle}>Create a similar group</Text>
            <Text style={s.rowDesc}>Start another group and choose its members.</Text>
          </View>
          <GroupActionIcon kind="chevron" color="#98A2B3" />
        </Pressable>

        <View style={s.memberHeader}>
          <Text style={s.section}>Members</Text>
          <GroupActionIcon kind="search" />
        </View>

        <MemberAction
          icon="add"
          title="Add members"
          onPress={() => navigation.navigate("GroupAddMembers", { conversationId: id })}
         styles={s}/>
        <MemberAction
          icon="link"
          title="Invite via link or QR code"
          onPress={() => navigation.navigate("GroupInvite", { conversationId: id })}
         styles={s}/>
        <MemberAction
          icon="tag"
          title="Add member tags"
          onPress={() => Alert.alert("Member tags", "Use the tag icon beside a member to add or remove their tag.")}
         styles={s}/>

        {members.map((member) => (
          <View style={s.member} key={member.id}>
            <View style={s.memberAvatar}>
              {member.profilePhoto ? (
                <Image source={{ uri: member.profilePhoto }} style={s.memberPhoto} />
              ) : (
                <Text style={s.memberInitial}>
                  {(member.displayName || "R").slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={s.flex}>
              <Text style={s.memberName}>{member.displayName || member.profileId}</Text>
              <Text style={s.memberMeta}>
                {member.role === "owner" || member.role === "admin"
                  ? "Group Admin"
                  : member.memberTag || ""}
              </Text>
            </View>
            {member.role !== "owner" && group.isAdmin ? (
              <Pressable
                hitSlop={8}
                onPress={async () => {
                  try {
                    await groupService.setMemberTag(
                      id,
                      member.profileId,
                      member.memberTag ? null : "Member",
                    );
                    await load();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Unable to change tag.");
                  }
                }}
              >
                <GroupActionIcon kind="tag" size={21} color="#1877F2" />
              </Pressable>
            ) : null}
          </View>
        ))}

        <MemberAction
          icon="list"
          title="View member changes"
          onPress={() => navigation.navigate("GroupMemberChanges", { conversationId: id })}
         styles={s}/>
        <MemberAction
          icon="star"
          title={chatSettings?.favorite ? "Remove from Favorites" : "Add to Favorites"}
          onPress={async () => {
            try {
              await chatInfoService.updateSettings(id, {
                favorite: !chatSettings?.favorite,
              });
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Favorites could not be updated.");
            }
          }}
         styles={s}/>
        <MemberAction
          icon="list"
          title="Add to list"
          onPress={() => Alert.alert("Lists", "Private group lists are not available in this group yet.")}
         styles={s}/>
        <MemberAction
          icon="clear"
          title="Clear chat"
          onPress={() =>
            Alert.alert(
              "Clear chat",
              "Clear this group chat for you? Other participants keep their copies.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Clear",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await chatInfoService.clearChat(id);
                      Alert.alert("Chat cleared");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Chat could not be cleared.");
                    }
                  },
                },
              ],
            )
          }
         styles={s}/>
        <MemberAction icon="leave" title="Exit group" danger onPress={leave}  styles={s}/>
        <MemberAction
          icon="report"
          title="Report group"
          danger
          onPress={() => navigation.navigate("GroupReport", { conversationId: id })}
         styles={s}/>

        {error ? <Text style={s.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Quick({
  icon,
  label,
  onPress,
  styles,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable style={styles.quickItem} onPress={onPress}>
      <View style={styles.quickCircle}>
        <GroupActionIcon kind={icon} color="#111" />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function Info({
  icon,
  title,
  sub,
  onPress,
  styles,
}: {
  icon: any;
  title: string;
  sub: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable style={styles.info} onPress={onPress}>
      <GroupActionIcon kind={icon} />
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDesc}>{sub}</Text>
      </View>
      <GroupActionIcon kind="chevron" size={22} color="#98A2B3" />
    </Pressable>
  );
}

function MemberAction({
  icon,
  title,
  onPress,
  danger = false,
  styles,
}: {
  icon: any;
  title: string;
  onPress: () => void;
  danger?: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable style={styles.action} onPress={onPress}>
      <GroupActionIcon kind={icon} color={danger ? "#C9184A" : "#667085"} />
      <Text style={[styles.actionText, danger && styles.dangerText]}>{title}</Text>
    </Pressable>
  );
}

function Menu({
  icon,
  title,
  onPress,
  styles,
}: {
  icon: any;
  title: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <GroupActionIcon kind={icon} />
      <Text style={styles.menuText}>{title}</Text>
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) { return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 60,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  menu: {
    position: "absolute",
    right: 10,
    top: 56,
    zIndex: 30,
    width: 240,
    backgroundColor: colors.surface,
    borderRadius: 12,
    elevation: 8,
    paddingVertical: 6,
  },
  menuItem: {
    height: 50,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  menuText: { fontSize: 16, color: colors.text },
  content: { paddingBottom: 45 },
  hero: { backgroundColor: colors.surface, alignItems: "center", padding: 24 },
  avatar: { width: 128, height: 128, borderRadius: 64 },
  avatarFallback: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontSize: 50, fontWeight: "800", color: "#FFF" },
  name: { fontSize: 27, color: colors.text, marginTop: 14 },
  count: { color: colors.textSecondary, marginTop: 3 },
  description: { color: "#218B67", fontSize: 16, marginTop: 12 },
  quick: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 20,
  },
  quickItem: { alignItems: "center" },
  quickCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#F2F3F5",
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { marginTop: 6, color: colors.text },
  info: {
    minHeight: 72,
    backgroundColor: colors.surface,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowTitle: { fontSize: 17, color: colors.text },
  rowDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
  memberHeader: {
    backgroundColor: colors.surface,
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  section: { fontSize: 17, fontWeight: "700", color: "#344054" },
  action: {
    minHeight: 62,
    backgroundColor: colors.surface,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionText: { fontSize: 17, color: colors.text },
  dangerText: { color: "#C9184A" },
  member: {
    minHeight: 72,
    backgroundColor: colors.surface,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  memberAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#EEF2F6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  memberPhoto: { width: 50, height: 50 },
  memberInitial: { fontSize: 20, fontWeight: "700", color: colors.textSecondary },
  memberName: { fontSize: 16, color: colors.text },
  memberMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 3 },
  error: { padding: 22, color: "#B42318" },
  flex: { flex: 1 },
}); }