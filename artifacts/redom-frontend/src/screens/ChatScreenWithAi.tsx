import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { ChatScreen } from "./ChatScreen";
import { ChatLockGate } from "./ChatLockGate";

export function ChatScreenWithAi(props: NativeStackScreenProps<RootStackParamList, "Chat">) {
  return (
    <ChatLockGate conversationId={props.route.params.conversationId}>
      <ChatScreen {...props} />
    </ChatLockGate>
  );
}
