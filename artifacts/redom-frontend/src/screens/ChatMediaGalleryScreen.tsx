import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { messageService, type ReDomMessage } from "../messages/messageService";
import { SecureMediaViewerModal } from "./SecureMediaViewerModal";
import { ChatInfoIcon } from "../components/ChatInfoIcon";
import { NavigationIcon } from "../components/NavigationIcon";

type Props = NativeStackScreenProps<RootStackParamList, "ChatMediaGallery">;

export function ChatMediaGalleryScreen({ route, navigation }: Props) {
  const [messages, setMessages] = useState<ReDomMessage[]>([]);
  const [selected, setSelected] = useState<ReDomMessage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void messageService
      .getCompletedMessages(route.params.conversationId)
      .then((result) => {
        if (!active) return;
        setMessages(
          result.messages
            .filter(
              (message) =>
                Boolean(message.attachment) &&
                !message.deletedForEveryone &&
                !message.deletedPlaceholder &&
                !message.lifecycle?.viewOnce,
            )
            .reverse(),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [route.params.conversationId]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <NavigationIcon kind="back" size={27} />
        </Pressable>
        <View style={styles.titleCopy}>
          <Text style={styles.title}>Media, links, and docs</Text>
          <Text style={styles.subtitle}>{messages.length} items</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1877F2" />
        </View>
      ) : (
        <FlatList
          data={messages}
          numColumns={3}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable style={styles.tile} onPress={() => setSelected(item)}>
              <View style={styles.tileInner}>
                <ChatInfoIcon name="media" size={32} color="#667085" />
                <Text numberOfLines={2} style={styles.tileText}>
                  {item.attachment?.fileName || item.messageType}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>
                No shared media, links, or documents yet.
              </Text>
            </View>
          }
        />
      )}

      <SecureMediaViewerModal
        visible={Boolean(selected)}
        message={selected}
        onClose={() => setSelected(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFF" },
  header: {
    height: 62,
    borderBottomWidth: 1,
    borderBottomColor: "#EAECF0",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  titleCopy: { flex: 1, marginLeft: 12 },
  title: { fontSize: 18, fontWeight: "800", color: "#101828" },
  subtitle: { fontSize: 12, color: "#667085", marginTop: 2 },
  grid: { padding: 8 },
  tile: { width: "33.33%", aspectRatio: 1, padding: 4 },
  tileInner: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#F2F4F7",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  tileText: {
    marginTop: 7,
    fontSize: 11,
    color: "#475467",
    textAlign: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  empty: { fontSize: 15, color: "#667085", textAlign: "center" },
});
