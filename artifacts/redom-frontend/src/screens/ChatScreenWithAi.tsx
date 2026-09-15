import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { ChatScreen } from "./ChatScreen";
import { ChatLockGate } from "./ChatLockGate";
import { DirectChatCallBridge } from "./DirectChatCallBridge";
import { ChatEncryptionNotice } from "../components/ChatEncryptionNotice";

export function ChatScreenWithAi(props: NativeStackScreenProps<RootStackParamList, "Chat">) {
  return (
    <ChatLockGate conversationId={props.route.params.conversationId}>
      <View style={{ flex: 1 }}>
        <ChatScreen {...props} />
        <View pointerEvents="box-none" style={{ position: "absolute", top: 92, left: 0, right: 0 }}>
          <ChatEncryptionNotice />
        </View>
        <DirectChatCallBridge conversationId={props.route.params.conversationId} />
      </View>
    </ChatLockGate>
  );
}
