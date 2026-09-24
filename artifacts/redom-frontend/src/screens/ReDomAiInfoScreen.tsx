import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { useAuthContext } from "../auth/context";
import ReDomAiLogo from "../assets/ai/redom-ai-logo.svg";
import { AiBackIcon, AiEditIcon, AiImageIcon, AiInfoIcon, AiSparkIcon } from "../assets/ai/AiIcon";

type Props = NativeStackScreenProps<RootStackParamList, "ReDomAIInfo">;
const MUTE_KEY = "redom.ai.muted";

export function ReDomAiInfoScreen({ navigation }: Props) {
  const { user } = useAuthContext();
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(MUTE_KEY).then((value) => setMuted(value === "1"));
  }, []);

  const toggleMute = async () => {
    const next = !muted;
    setMuted(next);
    await AsyncStorage.setItem(MUTE_KEY, next ? "1" : "0");
  };

  return <SafeAreaView style={styles.root}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.headerButton}><AiBackIcon size={27} /></Pressable>
      <View style={styles.headerSpacer} />
      <Pressable accessibilityRole="button" accessibilityLabel="ReDom AI information" onPress={() => Alert.alert("ReDom AI", "This is ReDom AI information and settings.")} style={styles.headerButton}><AiInfoIcon size={25} color="#111111" /></Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ReDomAiLogo width={108} height={108} />
      <Text style={styles.title}>ReDom AI</Text>
      <Text style={styles.badge}>AI assistant</Text>

      <View style={styles.actionRow}>
        <Pressable style={styles.actionButton} onPress={() => navigation.navigate("Profile")} accessibilityRole="button" accessibilityLabel="Open profile">
          <View style={styles.actionIcon}><AiInfoIcon size={24} color="#111111" /></View>
          <Text style={styles.actionText}>Profile</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => void toggleMute()} accessibilityRole="button" accessibilityLabel={muted ? "Unmute ReDom AI" : "Mute ReDom AI"}>
          <View style={[styles.actionIcon, muted && styles.actionIconActive]}><Text style={styles.muteGlyph}>{muted ? "🔕" : "🔔"}</Text></View>
          <Text style={styles.actionText}>{muted ? "Unmute" : "Mute"}</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>Create and explore</Text>
      <View style={styles.cardGroup}>
        <Pressable style={styles.card} onPress={() => navigation.navigate("ReDomAI", { prefill: "Create an image of ", imageMode: true })}>
          <View style={styles.cardIcon}><AiImageIcon size={25} /></View>
          <View style={styles.cardCopy}><Text style={styles.cardTitle}>Create image</Text><Text style={styles.cardBody}>Describe an image and ReDom AI can generate it for you.</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.card} onPress={() => navigation.navigate("ReDomAI", { prefill: "Imagine something creative about " })}>
          <View style={styles.cardIcon}><AiSparkIcon size={25} /></View>
          <View style={styles.cardCopy}><Text style={styles.cardTitle}>Imagine things</Text><Text style={styles.cardBody}>Brainstorm ideas, stories, concepts and creative possibilities.</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>AI info</Text>
      <View style={styles.cardGroup}>
        <Pressable style={styles.card} onPress={() => navigation.navigate("ReDomAI")}>
          <View style={styles.cardIcon}><AiSparkIcon size={25} /></View>
          <View style={styles.cardCopy}><Text style={styles.cardTitle}>ReDom AI app</Text><Text style={styles.cardBody}>Start talking to ReDom AI for answers, ideas, writing and supported creative tasks.</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.card} onPress={() => navigation.navigate("ReDomAIPolicy")}>
          <View style={styles.cardIcon}><AiInfoIcon size={25} /></View>
          <View style={styles.cardCopy}><Text style={styles.cardTitle}>Accuracy</Text><Text style={styles.cardBody}>AI responses can be inaccurate or incomplete. Verify important information before relying on it.</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.card} onPress={() => navigation.navigate("ReDomAIPolicy")}>
          <View style={styles.cardIcon}><AiEditIcon size={25} /></View>
          <View style={styles.cardCopy}><Text style={styles.cardTitle}>AI training</Text><Text style={styles.cardBody}>Learn about ReDom AI's published boundaries, privacy rules and how AI features are governed.</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>Privacy</Text>
      <View style={styles.cardGroup}>
        <Pressable style={styles.card} onPress={() => navigation.navigate("ReDomAIPolicy")}>
          <View style={styles.cardIcon}><AiInfoIcon size={25} /></View>
          <View style={styles.cardCopy}><Text style={styles.cardTitle}>AI Policy</Text><Text style={styles.cardBody}>Search ReDom's current AI policy for privacy, safety, capabilities and boundaries.</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>
      <Text style={styles.footer}>Signed in as {user?.firstName ? `${user.firstName} ${user.lastName}`.trim() : "your ReDom profile"}.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  header: { height: 58, borderBottomWidth: 1, borderBottomColor: "#ECEFF1", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  headerButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  headerSpacer: { flex: 1 },
  content: { alignItems: "center", paddingHorizontal: 18, paddingTop: 34, paddingBottom: 42 },
  title: { marginTop: 12, color: "#050505", fontSize: 30, fontWeight: "800" },
  badge: { marginTop: 4, color: "#667085", fontSize: 14, fontWeight: "600" },
  actionRow: { width: "100%", flexDirection: "row", justifyContent: "center", gap: 42, marginTop: 26, marginBottom: 34 },
  actionButton: { alignItems: "center", minWidth: 74 },
  actionIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#EEF0F3", alignItems: "center", justifyContent: "center" },
  actionIconActive: { backgroundColor: "#E7F3FF" },
  muteGlyph: { fontSize: 23 },
  actionText: { marginTop: 8, color: "#111111", fontSize: 14 },
  sectionLabel: { width: "100%", marginTop: 20, marginBottom: 10, color: "#667085", fontSize: 16, fontWeight: "800" },
  cardGroup: { width: "100%" },
  card: { minHeight: 82, flexDirection: "row", alignItems: "center", paddingVertical: 13, gap: 13, borderBottomWidth: 1, borderBottomColor: "#F0F2F5" },
  cardIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  cardCopy: { flex: 1 },
  cardTitle: { color: "#111111", fontSize: 16, fontWeight: "600" },
  cardBody: { marginTop: 3, color: "#667085", fontSize: 14, lineHeight: 19 },
  chevron: { color: "#98A2B3", fontSize: 28, paddingLeft: 3 },
  footer: { width: "100%", marginTop: 30, color: "#98A2B3", fontSize: 12, textAlign: "center" },
});
