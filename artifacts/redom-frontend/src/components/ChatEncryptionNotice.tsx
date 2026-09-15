import React, { useState } from "react";
import { Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { ChatInfoIcon } from "./ChatInfoIcon";

type Props = { visible?: boolean };
type Navigation = NativeStackNavigationProp<RootStackParamList>;

const DETAILS: Array<{ icon: "list" | "call" | "media" | "location" | "privacy"; label: string }> = [
  { icon: "list", label: "Text and voice messages" },
  { icon: "call", label: "Audio and video calls" },
  { icon: "media", label: "Photos, videos and documents" },
  { icon: "location", label: "Location sharing" },
  { icon: "privacy", label: "Status updates" },
];

export function ChatEncryptionNotice({ visible = true }: Props) {
  const navigation = useNavigation<Navigation>();
  const [open, setOpen] = useState(false);

  if (!visible) return null;

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="End-to-end encryption information" onPress={() => setOpen(true)} style={styles.banner}>
        <ChatInfoIcon name="encryption" size={15} color="#4A4A4A" />
        <Text style={styles.bannerText}>
          Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them. <Text style={styles.bannerLink}>Learn more</Text>
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Pressable accessibilityRole="button" accessibilityLabel="Close encryption information" onPress={() => setOpen(false)} style={styles.close}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>

            <View style={styles.illustration}>
              <View style={styles.safeBody}>
                <View style={styles.safeDial}><ChatInfoIcon name="encryption" size={38} color="#101828" /></View>
                <View style={styles.safeLatch} />
              </View>
              <View style={styles.lock}><ChatInfoIcon name="lock" size={48} color="#101828" /></View>
            </View>

            <Text style={styles.title}>Your chats and calls are private</Text>
            <Text style={styles.description}>
              End-to-end encryption keeps your personal messages and calls between you and the people you choose. No one outside of the chat, not even ReDom, can read, listen to, or share them. This includes your:
            </Text>

            <View style={styles.details}>
              {DETAILS.map((item) => (
                <View key={item.label} style={styles.detailRow}>
                  <ChatInfoIcon name={item.icon} size={25} color="#667085" />
                  <Text style={styles.detailText}>{item.label}</Text>
                </View>
              ))}
            </View>

            <Pressable accessibilityRole="button" accessibilityLabel="Open ReDom encryption policy" onPress={() => { setOpen(false); navigation.navigate("Policy", { slug: "messaging" }); }} style={styles.learnMore}>
              <Text style={styles.learnMoreText}>Learn more</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: 24, marginTop: 10, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: "#FFF6E5", flexDirection: "row", alignItems: "flex-start" },
  bannerText: { flex: 1, marginLeft: 7, color: "#4A4A4A", fontSize: 14, lineHeight: 19, textAlign: "center" },
  bannerLink: { fontWeight: "800" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#FFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 28, paddingTop: 18, paddingBottom: 24, maxHeight: "94%" },
  handle: { alignSelf: "center", width: 62, height: 5, borderRadius: 4, backgroundColor: "#98A2B3", marginBottom: 14 },
  close: { position: "absolute", top: 72, left: 25, zIndex: 2, width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: 38, lineHeight: 38, fontWeight: "300", color: "#667085" },
  illustration: { height: 175, alignItems: "center", justifyContent: "center", marginTop: 6 },
  safeBody: { width: 150, height: 122, borderRadius: 25, backgroundColor: "#20D66B", borderWidth: 2, borderColor: "#101828", alignItems: "center", justifyContent: "center", transform: [{ rotate: "-1deg" }] },
  safeDial: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: "#101828", alignItems: "center", justifyContent: "center" },
  safeLatch: { position: "absolute", right: -2, top: 29, width: 10, height: 65, borderWidth: 2, borderColor: "#101828", borderRadius: 6 },
  lock: { position: "absolute", right: 58, bottom: 4, width: 76, height: 82, borderRadius: 20, backgroundColor: "#F8F4EC", borderWidth: 2, borderColor: "#101828", alignItems: "center", justifyContent: "center" },
  title: { marginTop: 8, textAlign: "center", fontSize: 25, lineHeight: 31, fontWeight: "800", color: "#050505" },
  description: { marginTop: 14, textAlign: "center", fontSize: 16, lineHeight: 24, color: "#667085" },
  details: { marginTop: 18, gap: 13 },
  detailRow: { flexDirection: "row", alignItems: "center", minHeight: 28 },
  detailText: { marginLeft: 15, fontSize: 16, color: "#667085" },
  learnMore: { marginTop: 22, minHeight: 54, borderRadius: 28, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" },
  learnMoreText: { color: "#FFF", fontSize: 17, fontWeight: "800" },
});
