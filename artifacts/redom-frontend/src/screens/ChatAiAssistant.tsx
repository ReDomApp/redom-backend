import { Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { AiSparkIcon } from "../assets/ai/AiIcon";

interface Props { conversationId: string; }

export function ChatAiAssistant({ conversationId }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return <Pressable accessibilityRole="button" accessibilityLabel="Open ReDom AI for this chat" onPress={() => navigation.navigate("ReDomAI", { conversationId })} style={styles.aiButton}><AiSparkIcon size={22} color="#FFFFFF"/></Pressable>;
}

const styles = StyleSheet.create({
  aiButton: { position: "absolute", top: 66, right: 54, zIndex: 50, width: 38, height: 38, borderRadius: 19, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", elevation: 5, shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
});
