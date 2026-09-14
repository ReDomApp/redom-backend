import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { messageService, type ReDomMessage } from "../messages/messageService";
import type { RootStackParamList } from "../routing/types";
import { AiSparkIcon } from "../assets/ai/AiIcon";

interface Props { conversationId: string; }
function contextFromMessages(messages: ReDomMessage[]) { return messages.filter((message) => message.message && !message.deletedForEveryone && !message.deletedPlaceholder).slice(-12).map((message) => `[Chat participant] ${message.message}`.slice(0, 2_000)).join("\n"); }

export function ChatAiAssistant({ conversationId }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [opening, setOpening] = useState(false);
  const open = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const result = await messageService.getCompletedMessages(conversationId);
      navigation.navigate("ReDomAI", { conversationId, context: contextFromMessages(result.messages) });
    } catch {
      navigation.navigate("ReDomAI", { conversationId });
    } finally { setOpening(false); }
  };
  return <Pressable accessibilityRole="button" accessibilityLabel="Open ReDom AI for this chat" onPress={() => void open()} disabled={opening} style={styles.aiButton}>{opening ? <ActivityIndicator size="small" color="#FFFFFF"/> : <AiSparkIcon size={22} color="#FFFFFF"/>}</Pressable>;
}

const styles = StyleSheet.create({ aiButton: { position: "absolute", top: 66, right: 54, zIndex: 50, width: 38, height: 38, borderRadius: 19, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", elevation: 5, shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } } });
