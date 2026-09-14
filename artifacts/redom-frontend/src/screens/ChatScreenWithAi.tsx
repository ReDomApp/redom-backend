import "../messages/forwardedMessageDecorationV2";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { ChatScreen } from "./ChatScreen";
import { ChatAiAssistant } from "./ChatAiAssistant";
import { ChatToolsOverlay } from "./ChatToolsOverlay";
import { AttachmentIcon } from "../messages/AttachmentIcon";

export function ChatScreenWithAi(props: NativeStackScreenProps<RootStackParamList, "Chat">) {
  const [tools,setTools]=useState<"attachment"|"call"|null>(null);
  return <View style={styles.root}>
    <ChatScreen {...props} />
    <ChatAiAssistant conversationId={props.route.params.conversationId} />
    <View pointerEvents="box-none" style={styles.controls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Chat attachments" onPress={()=>setTools("attachment")} style={styles.floating}><AttachmentIcon kind="document" size={22} color="#FFF"/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Chat calls" onPress={()=>setTools("call")} style={styles.floating}><AttachmentIcon kind="voice" size={22} color="#FFF"/></Pressable>
    </View>
    {tools?<ChatToolsOverlay conversationId={props.route.params.conversationId} visible mode={tools} onClose={()=>setTools(null)} onChanged={()=>props.navigation.replace("Chat",{conversationId:props.route.params.conversationId})}/>:null}
  </View>;
}
const styles=StyleSheet.create({root:{flex:1},controls:{position:"absolute",top:58,right:12,gap:10},floating:{width:44,height:44,borderRadius:22,backgroundColor:"#1877F2",alignItems:"center",justifyContent:"center",elevation:4,shadowColor:"#000",shadowOpacity:.15,shadowRadius:5,shadowOffset:{width:0,height:2}}});
