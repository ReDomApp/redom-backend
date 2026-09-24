import type { ComponentProps } from "react";
import { MessagesScreen } from "./MessagesScreen";
import { GlobalReDomAiAssistant } from "./GlobalReDomAiAssistant";

export function MessagesScreenWithAi(props: ComponentProps<typeof MessagesScreen>) {
  return <><MessagesScreen {...props} /><GlobalReDomAiAssistant /></>;
}
