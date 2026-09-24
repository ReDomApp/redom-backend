import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { groupService, type GroupSettings } from "../messages/groupService";
import { GroupActionIcon } from "../components/GroupActionIcon";

type Props = NativeStackScreenProps<RootStackParamList, "GroupIcon">;
type PickerKind = "camera" | "gallery";

const EMOJIS = ["😀", "😎", "😂", "😍", "🥳", "🔥", "⭐", "💙", "🌎", "🚀", "🎯", "💬", "🤝", "🎉", "🛡️", "💡"];

export function GroupIconScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [group, setGroup] = useState<GroupSettings | null>(null);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = route.params.conversationId;

  const load = useCallback(async () => {
    const result = await groupService.getDetails(id);
    setGroup(result.group);
  }, [id]);

  useEffect(() => {
    void load().catch(() => navigation.goBack());
  }, [load, navigation]);

  const choose = async (kind: PickerKind) => {
    setBusy(true);
    setSheet(false);
    try {
      const permission = kind === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", kind === "camera"
          ? "Allow ReDom to use the camera to take a group icon."
          : "Allow ReDom to access photos to choose a group icon.");
        return;
      }
      const result = kind === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: true, aspect: [1, 1] })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
      if (result.canceled || !result.assets[0]?.uri) return;
      await groupService.updatePhoto(id, result.assets[0].uri);
      await load();
    } catch (error) {
      Alert.alert("Group icon", error instanceof Error ? error.message : "The group icon could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  const saveEmoji = async (value: string) => {
    setSheet(false);
    setBusy(true);
    try {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="256" fill="#1877F2"/><text x="256" y="330" text-anchor="middle" font-size="230">${value}</text></svg>`;
      await groupService.updatePhoto(id, `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
      await load();
    } catch (error) {
      Alert.alert("Group icon", error instanceof Error ? error.message : "The emoji icon could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setSheet(false);
    setBusy(true);
    try {
      await groupService.updatePhoto(id, null);
      await load();
    } catch (error) {
      Alert.alert("Group icon", error instanceof Error ? error.message : "The group icon could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!group?.groupPhoto) return;
    await Share.share({ message: group.groupPhoto });
  };

  const showEmojiPicker = () => {
    const buttons = EMOJIS.map((value) => ({ text: value, onPress: () => void saveEmoji(value) }));
    buttons.push({ text: "Cancel", onPress: () => undefined });
    Alert.alert("Emoji & stickers", "Choose an emoji for this group icon.", buttons);
  };

  if (!group) {
    return <SafeAreaView style={styles.root}><ActivityIndicator style={styles.loading} color="#1877F2" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <GroupActionIcon kind="back" size={30} color="#FFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Group icon</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setSheet(true)} hitSlop={8}><GroupActionIcon kind="edit" size={27} color="#FFF" /></Pressable>
          <Pressable onPress={() => void share()} hitSlop={8}><GroupActionIcon kind="share" size={27} color="#FFF" /></Pressable>
        </View>
      </View>

      <View style={styles.viewer}>
        {group.groupPhoto ? (
          <Image source={{ uri: group.groupPhoto }} style={styles.photo} resizeMode="contain" />
        ) : (
          <View style={styles.empty}>
            <GroupActionIcon kind="members" size={100} color="#1877F2" />
            <Text style={styles.emptyText}>{group.groupName.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
      </View>

      {busy ? <View style={styles.busy}><ActivityIndicator color="#FFF" /></View> : null}

      {sheet ? (
        <View style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheet(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetTitle}>
              <Pressable onPress={() => setSheet(false)} hitSlop={8}><GroupActionIcon kind="close" size={26} color="#111" /></Pressable>
              <Text style={styles.sheetHeading}>Group icon</Text>
              <Pressable onPress={() => void remove()} hitSlop={8}><GroupActionIcon kind="trash" size={26} color="#111" /></Pressable>
            </View>
            <Action styles={styles} icon="camera" title="Camera" onPress={() => void choose("camera")} />
            <Action styles={styles} icon="image" title="Gallery" onPress={() => void choose("gallery")} />
            <Action styles={styles} icon="emoji" title="Emoji & stickers" onPress={showEmojiPicker} />
            <Action styles={styles} icon="search" title="Search web" onPress={() => {
              setSheet(false);
              void Linking.openURL("https://www.google.com/search?tbm=isch&q=group+icon");
            }} />
            <Action styles={styles} icon="sparkle" title="AI images" onPress={() => {
              setSheet(false);
              navigation.navigate("ReDomAI", { context: `Create a square group icon for ${group.groupName}` });
            }} />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Action({ icon, title, onPress, styles }: { icon: any; title: string; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return (
    <Pressable style={styles.action} onPress={onPress}>
      <GroupActionIcon kind={icon} />
      <Text style={styles.actionText}>{title}</Text>
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) { return StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  loading: { marginTop: 60 },
  header: { height: 64, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#000" },
  headerTitle: { fontSize: 20, color: "#FFF" },
  headerActions: { flexDirection: "row", gap: 26 },
  viewer: { flex: 1, alignItems: "center", justifyContent: "center" },
  photo: { width: "100%", height: "100%" },
  empty: { width: 280, height: 280, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  emptyText: { fontSize: 100, fontWeight: "800", color: colors.primary, marginTop: -80 },
  busy: { position: "absolute", top: 64, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "#0008" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "#0008", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 12, paddingBottom: 28 },
  handle: { alignSelf: "center", width: 62, height: 6, borderRadius: 3, backgroundColor: "#98A2B3", marginBottom: 10 },
  sheetTitle: { height: 58, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetHeading: { fontSize: 19, fontWeight: "600", color: "#111" },
  action: { height: 70, paddingHorizontal: 28, flexDirection: "row", alignItems: "center", gap: 22 },
  actionText: { fontSize: 17, color: colors.text },
}); }