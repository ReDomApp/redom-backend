import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { aiService } from "../ai/aiService";

type ChatItem = { id: string; role: "user" | "assistant"; text: string; webSearchUsed?: boolean };

export function ReDomAIScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const scrollRef = useRef<ScrollView>(null);
  const [items, setItems] = useState<ChatItem[]>([
    { id: "welcome", role: "assistant", text: "Hi, I'm ReDom AI. Ask me anything, including current questions that may need web search. I only see chat content you explicitly share with me." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [responseId, setResponseId] = useState<string | undefined>();
  const [error, setError] = useState("");

  const send = async () => {
    const message = input.trim();
    if (!message || busy) return;
    setInput(""); setError(""); setBusy(true);
    const userId = `u-${Date.now()}`;
    setItems((current) => [...current, { id: userId, role: "user", text: message }]);
    try {
      const result = await aiService.chat(message, responseId);
      setResponseId(result.responseId);
      setItems((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", text: result.text, webSearchUsed: result.webSearchUsed }]);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "ReDom AI is temporarily unavailable.");
    } finally { setBusy(false); }
  };

  return <SafeAreaView style={styles.root}><KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={styles.header}><Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back"><Text style={styles.back}>‹</Text></Pressable><View style={styles.identity}><View style={styles.aiDot}><Text style={styles.aiText}>AI</Text></View><View><Text style={styles.title}>ReDom AI</Text><Text style={styles.subtitle}>General AI · Web search when useful</Text></View></View><View style={{ width: 32 }} /></View>
    <View style={styles.notice}><Text style={styles.noticeText}>AI is optional. Your normal private chats stay private and encrypted. Only content you explicitly send to ReDom AI is shared with the AI service.</Text></View>
    <ScrollView ref={scrollRef} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
      {items.map((item) => <View key={item.id} style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}><Text style={item.role === "user" ? styles.userText : styles.aiBubbleText}>{item.text}</Text>{item.webSearchUsed ? <Text style={styles.searchLabel}>Web search used</Text> : null}</View>)}
      {busy ? <View style={[styles.bubble, styles.aiBubble]}><ActivityIndicator color="#1877F2" /><Text style={styles.thinking}>Thinking…</Text></View> : null}
      {error ? <Pressable onPress={() => setError("")} style={styles.error}><Text style={styles.errorText}>{error}</Text></Pressable> : null}
    </ScrollView>
    <View style={styles.composer}><TextInput value={input} onChangeText={setInput} placeholder="Ask ReDom AI" placeholderTextColor="#8A8D91" style={styles.input} multiline maxLength={12000} /><Pressable disabled={!input.trim() || busy} onPress={() => void send()} style={[styles.send, (!input.trim() || busy) && styles.sendDisabled]} accessibilityLabel="Send to ReDom AI"><Text style={styles.sendText}>➤</Text></Pressable></View>
  </KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#F0F2F5"},header:{height:62,backgroundColor:"#FFF",borderBottomWidth:1,borderBottomColor:"#E4E6EB",flexDirection:"row",alignItems:"center",paddingHorizontal:12},back:{fontSize:38,color:"#1877F2"},identity:{flex:1,flexDirection:"row",alignItems:"center",justifyContent:"center"},aiDot:{width:38,height:38,borderRadius:19,backgroundColor:"#1877F2",alignItems:"center",justifyContent:"center",marginRight:9},aiText:{color:"#FFF",fontSize:11,fontWeight:"900"},title:{fontSize:17,fontWeight:"800",color:"#050505"},subtitle:{fontSize:11,color:"#65676B",marginTop:2},notice:{backgroundColor:"#E8F1FF",paddingHorizontal:14,paddingVertical:9},noticeText:{fontSize:12,color:"#344054",lineHeight:17},messages:{padding:12,paddingBottom:20},bubble:{maxWidth:"86%",paddingHorizontal:13,paddingVertical:10,borderRadius:16,marginBottom:9},userBubble:{alignSelf:"flex-end",backgroundColor:"#1877F2",borderBottomRightRadius:5},aiBubble:{alignSelf:"flex-start",backgroundColor:"#FFF",borderBottomLeftRadius:5},userText:{color:"#FFF",fontSize:15,lineHeight:21},aiBubbleText:{color:"#050505",fontSize:15,lineHeight:21},searchLabel:{marginTop:7,color:"#667085",fontSize:10,fontWeight:"700"},thinking:{color:"#65676B",fontSize:12,marginTop:3},error:{backgroundColor:"#FFF1F1",padding:10,borderRadius:10},errorText:{color:"#B42318",fontSize:13},composer:{minHeight:60,backgroundColor:"#FFF",borderTopWidth:1,borderTopColor:"#E4E6EB",padding:8,flexDirection:"row",alignItems:"flex-end"},input:{flex:1,minHeight:42,maxHeight:120,borderRadius:21,backgroundColor:"#F0F2F5",paddingHorizontal:15,paddingVertical:10,color:"#050505",fontSize:15},send:{width:42,height:42,borderRadius:21,backgroundColor:"#1877F2",alignItems:"center",justifyContent:"center",marginLeft:7},sendDisabled:{backgroundColor:"#D9DDE3"},sendText:{color:"#FFF",fontSize:20,fontWeight:"800"}
});
