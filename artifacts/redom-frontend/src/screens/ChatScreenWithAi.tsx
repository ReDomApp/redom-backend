import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { ChatScreen } from "./ChatScreen";
import { ChatLockGate } from "./ChatLockGate";
import { DirectChatCallBridge } from "./DirectChatCallBridge";

export function ChatScreenWithAi(props: NativeStackScreenProps<RootStackParamList, "Chat">) {
  return (
    <ChatLockGate conversationId={props.route.params.conversationId}>
      <View style={{ flex: 1 }}>
        <ChatScreen {...props} />
        <DirectChatCallBridge conversationId={props.route.params.conversationId} />
      </View>
    </ChatLockGate>
  );
}
