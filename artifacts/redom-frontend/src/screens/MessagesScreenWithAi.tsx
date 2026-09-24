import { MessagesScreen } from "./MessagesScreen";
import { GlobalReDomAiAssistant } from "./GlobalReDomAiAssistant";

export function MessagesScreenWithAi(props: Record<string, never>) {
  return <><MessagesScreen {...props} /><GlobalReDomAiAssistant /></>;
}
