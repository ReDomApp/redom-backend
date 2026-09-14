import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { ChatScreen } from "./ChatScreen";
import { ChatAiAssistant } from "./ChatAiAssistant";

export function ChatScreenWithAi(props: NativeStackScreenProps<RootStackParamList, "Chat">) {
  return <>
    <ChatScreen {...props} />
    <ChatAiAssistant conversationId={props.route.params.conversationId} />
  </>;
}
