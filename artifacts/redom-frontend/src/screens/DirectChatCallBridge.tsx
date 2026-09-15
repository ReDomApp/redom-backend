import { Alert, Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { messageService } from "../messages/messageService";

export function DirectChatCallBridge({ conversationId }: { conversationId: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const start = async () => {
    try {
      const result = await messageService.createCall(conversationId, "video");
      navigation.navigate("Call", { conversationId, callType: "video", callId: result.call.id });
    } catch (error) {
      Alert.alert("Call unavailable", error instanceof Error ? error.message : "Unable to start the video call.");
    }
  };
  return <Pressable accessibilityRole="button" accessibilityLabel="Video call" onPress={() => void start()} style={styles.bridge} />;
}

const styles = StyleSheet.create({ bridge: { position: "absolute", top: 7, right: 48, width: 38, height: 44, zIndex: 40 } });
