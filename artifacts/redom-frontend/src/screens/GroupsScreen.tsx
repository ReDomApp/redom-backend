import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { publicGroupService, type PublicGroup } from "../groups/publicGroupService";
import { GroupActionIcon } from "../components/GroupActionIcon";

type DiscoverGroup = PublicGroup;

export function GroupsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [groups, setGroups] = useState<DiscoverGroup[]>([]);
  const [joined, setJoined] = useState<PublicGroup[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [yourGroupsOpen, setYourGroupsOpen] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [discover, mine] = await Promise.all([
        publicGroupService.discover(query.trim() || undefined),
        publicGroupService.mine(),
      ]);
      setGroups(discover.groups ?? []);
      setJoined(mine.groups ?? []);
    } catch (e) {
      Alert.alert("Groups", e instanceof Error ? e.message : "Groups could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const visibleGroups = useMemo(
    () => groups.filter((group) => !dismissed.includes(group.id)),
    [groups, dismissed],
  );

  const join = async (group: DiscoverGroup) => {
    try {
      const result = await publicGroupService.join(group.id);

      if (result.pending) {
        Alert.alert(
          "Join request sent",
          (group.name || "This group") + " requires admin approval.",
        );
      } else {
        Alert.alert("Joined", "You joined " + (group.name || "this group") + ".");
      }

      setDismissed((value) => [...value, group.id]);

      if (!result.pending) {
        setJoined((value) => [...value, { ...group, role: "member" }]);
      }
    } catch (e) {
      Alert.alert(
        "Join group",
        e instanceof Error ? e.message : "Unable to join this group.",
      );
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <GroupActionIcon kind="back" size={30} color={colors.text} />
        </Pressable>

        {searchOpen ? (
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search groups"
            placeholderTextColor={colors.textSecondary}
            style={styles.search}
          />
        ) : (
          <Text style={styles.title}>Groups</Text>
        )}

        <View style={styles.headerActions}>
          <Pressable onPress={() => setCreateOpen(true)} hitSlop={7}>
            <GroupActionIcon kind="add" size={31} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => setYourGroupsOpen(true)} hitSlop={7}>
            <GroupActionIcon kind="members" size={31} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => setSearchOpen((value) => !value)} hitSlop={7}>
            <GroupActionIcon kind="search" size={31} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        <View style={styles.activeTab}>
          <Text style={styles.activeTabText}>Discover</Text>
        </View>
      </ScrollView>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
        }
        contentContainerStyle={styles.content}
      >
        <Text style={styles.sectionTitle}>Suggested for you</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#1877F2" style={styles.loading} />
        ) : visibleGroups.length ? (
          <View style={styles.grid}>
            {visibleGroups.map((group) => (
              <View key={group.id} style={styles.card}>
                <View style={styles.imageWrap}>
                  {group.groupPhoto ? (
                    <Image source={{ uri: group.groupPhoto }} style={styles.cover} />
                  ) : (
                    <View style={styles.coverFallback}>
                      <GroupActionIcon kind="members" size={58} color="#1877F2" />
                    </View>
                  )}

                  <Pressable
                    onPress={() => setDismissed((value) => [...value, group.id])}
                    style={styles.dismiss}
                    hitSlop={4}
                  >
                    <GroupActionIcon kind="close" size={22} color="#FFF" />
                  </Pressable>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.groupName} numberOfLines={2}>
                    {group.name || "ReDom group"}
                  </Text>
                  <Text style={styles.meta}>
                    {group.memberApprovalRequired
                      ? "Public group · Approval required · "
                      : "Public group · "}
                    {group.memberCount.toLocaleString()} members
                  </Text>

                  <Pressable onPress={() => void join(group)} style={styles.join}>
                    <Text style={styles.joinText}>Join</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <GroupActionIcon kind="members" size={62} color="#1877F2" />
            <Text style={styles.emptyTitle}>No groups to discover yet</Text>
            <Text style={styles.emptyText}>
              {query.trim()
                ? "Try a different group search."
                : "Public ReDom groups will appear here when available."}
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={yourGroupsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setYourGroupsOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setYourGroupsOpen(false)}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.yourTitle}>Your groups</Text>

          {joined.length ? (
            joined.map((group) => (
              <Pressable
                key={group.id}
                style={styles.yourRow}
                onPress={() => {
                  setYourGroupsOpen(false);
                  Alert.alert(
                    group.name || "ReDom group",
                    group.description || "You are a member of this public group.",
                  );
                }}
              >
                <View style={styles.yourIcon}>
                  <GroupActionIcon kind="members" size={25} color="#1877F2" />
                </View>
                <Text style={styles.yourName} numberOfLines={1}>
                  {group.name || "ReDom group"}
                </Text>
                <GroupActionIcon kind="chevron" size={22} color="#667085" />
              </Pressable>
            ))
          ) : (
            <Text style={styles.yourEmpty}>You haven't joined any groups yet.</Text>
          )}
        </View>
      </Modal>

      <Modal
        visible={createOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setCreateOpen(false)}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Pressable
            style={styles.sheetRow}
            onPress={() => {
              setCreateOpen(false);
              Alert.alert(
                "Create a post",
                "Choose a group you've joined to publish a group post. The group-post composer will be connected here.",
              );
            }}
          >
            <View style={styles.sheetIcon}>
              <GroupActionIcon kind="edit" size={28} color={colors.text} />
            </View>
            <View>
              <Text style={styles.sheetTitle}>Create a post</Text>
              <Text style={styles.sheetSub}>Post in a group you've joined.</Text>
            </View>
          </Pressable>

          <Pressable
            style={styles.sheetRow}
            onPress={() => {
              setCreateOpen(false);
              navigation.navigate("CreatePublicGroup");
            }}
          >
            <View style={styles.sheetIcon}>
              <GroupActionIcon kind="members" size={28} color={colors.text} />
            </View>
            <View>
              <Text style={styles.sheetTitle}>Create a group</Text>
              <Text style={styles.sheetSub}>Create a public or private group.</Text>
            </View>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: {
      height: 64,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
    },
    title: {
      flex: 1,
      textAlign: "center",
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
    },
    search: {
      flex: 1,
      marginHorizontal: 12,
      fontSize: 17,
      color: colors.text,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
      marginLeft: "auto",
    },
    tabs: {
      paddingHorizontal: 22,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    activeTab: {
      paddingHorizontal: 22,
      paddingVertical: 10,
      borderRadius: 24,
      backgroundColor: colors.surfaceSecondary,
    },
    activeTabText: { fontSize: 17, fontWeight: "700", color: "#1877F2" },
    content: { padding: 22, paddingBottom: 60 },
    sectionTitle: {
      fontSize: 28,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 24,
    },
    loading: { marginTop: 40 },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
    card: {
      width: "48.5%",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      overflow: "hidden",
      marginBottom: 18,
      backgroundColor: colors.surface,
    },
    imageWrap: { height: 185, backgroundColor: colors.surfaceSecondary },
    cover: { width: "100%", height: "100%" },
    coverFallback: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    dismiss: {
      position: "absolute",
      right: 10,
      top: 10,
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: "rgba(70,70,70,0.72)",
      alignItems: "center",
      justifyContent: "center",
    },
    cardBody: { padding: 14 },
    groupName: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.text,
      minHeight: 48,
    },
    meta: {
      fontSize: 16,
      color: colors.textSecondary,
      lineHeight: 22,
      minHeight: 44,
      marginTop: 4,
    },
    join: {
      height: 48,
      borderRadius: 10,
      backgroundColor: "#1877F2",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 12,
    },
    joinText: { fontSize: 18, fontWeight: "800", color: "#FFF" },
    empty: {
      alignItems: "center",
      paddingTop: 110,
      paddingHorizontal: 35,
    },
    emptyTitle: {
      fontSize: 22,
      fontWeight: "800",
      marginTop: 18,
      color: colors.text,
      textAlign: "center",
    },
    emptyText: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 8,
      lineHeight: 23,
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.42)",
    },
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 22,
      paddingTop: 10,
      paddingBottom: 34,
    },
    handle: {
      width: 76,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#8A8D91",
      alignSelf: "center",
      marginBottom: 10,
    },
    yourTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
      paddingHorizontal: 4,
      paddingBottom: 8,
    },
    yourRow: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    yourIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    yourName: {
      flex: 1,
      fontSize: 17,
      fontWeight: "600",
      color: colors.text,
    },
    yourEmpty: {
      fontSize: 16,
      color: colors.textSecondary,
      paddingVertical: 28,
      textAlign: "center",
    },
    sheetRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 18,
      gap: 18,
    },
    sheetIcon: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: colors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    sheetTitle: {
      fontSize: 19,
      fontWeight: "800",
      color: colors.text,
    },
    sheetSub: {
      fontSize: 15,
      color: colors.textSecondary,
      marginTop: 4,
    },
  });
}
