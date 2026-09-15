import { useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { GroupActionIcon } from "../components/GroupActionIcon";
import { groupReportService } from "../messages/groupReportService";
import { chatInfoService } from "../messages/chatInfoService";
import { useLanguage } from "../i18n/LanguageProvider";

type Props = NativeStackScreenProps<RootStackParamList, "GroupReport">;
const reasons = ["Spam or scam", "Harassment or bullying", "Hate or abusive content", "Violence or threats", "Sexual content", "Child safety", "Illegal activity", "Other"];

export function GroupReportScreen({ route, navigation }: Props) {
  const { language } = useLanguage();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [exitAfterReport, setExitAfterReport] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      const result = await groupReportService.submit(route.params.conversationId, {
        reason,
        details: details.trim() || undefined,
        exitAfterReport,
        language,
      });
      if (exitAfterReport) {
        try { await chatInfoService.clearChat(route.params.conversationId); } catch { /* backend already recorded local deletion and exit */ }
      }

      const emailMessage = result.emailNotificationSent
        ? " Your one-time report result email was sent in your current ReDom app language."
        : result.emailNotificationEligible
          ? " Your verified email is connected, but the report result email could not be sent."
          : " No verified email is connected, so no report result email was sent.";

      Alert.alert(
        "Report submitted",
        `ReDom AI Moderation checked ${result.evidenceCount} recent message(s). Status: ${result.status.replace(/_/g, " ")}.${emailMessage}`,
        [{ text: "Done", onPress: () => exitAfterReport ? navigation.navigate("Messages") : navigation.goBack() }],
      );
    } catch (error) {
      Alert.alert("Report not submitted", error instanceof Error ? error.message : "ReDom could not process this report.");
    } finally {
      setSubmitting(false);
    }
  };

  return <SafeAreaView style={s.root}>
    <View style={s.header}>
      <Pressable onPress={() => navigation.goBack()}><GroupActionIcon kind="back" size={28} color="#111827" /></Pressable>
      <Text style={s.title}>Report group</Text>
      <View style={{ width: 28 }} />
    </View>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.sheet}>
        <Text style={s.heading}>Tell ReDom what is wrong</Text>
        <Text style={s.description}>ReDom AI Moderation will check the report and the most recent available messages from this group. The group is not notified that you reported it.</Text>
        <Text style={s.label}>Reason</Text>
        {reasons.map(item => <Pressable key={item} style={s.reason} onPress={() => setReason(item)}><View style={[s.radio, reason === item && s.radioSelected]}>{reason === item ? <View style={s.radioDot} /> : null}</View><Text style={s.reasonText}>{item}</Text></Pressable>)}
        <Text style={s.label}>Additional details (optional)</Text>
        <TextInput value={details} onChangeText={setDetails} multiline maxLength={5000} placeholder="Add context that may help the review" placeholderTextColor="#98A2B3" style={s.input} />
        <Pressable style={s.checkboxRow} onPress={() => setExitAfterReport(v => !v)}><View style={[s.checkbox, exitAfterReport && s.checkboxOn]}>{exitAfterReport ? <Text style={s.check}>✓</Text> : null}</View><View style={{ flex: 1 }}><Text style={s.checkboxTitle}>Exit group and delete chat</Text><Text style={s.checkboxSub}>You will be removed from the group. Rejoining requires a new group invitation.</Text></View></Pressable>
        <Pressable disabled={!reason || submitting} style={[s.reportButton, (!reason || submitting) && s.disabled]} onPress={submit}><Text style={s.reportButtonText}>{submitting ? "Checking…" : "Report"}</Text></Pressable>
        <Pressable onPress={() => navigation.navigate("Policy", { slug: "messaging" })}><Text style={s.learn}>Learn more about ReDom reporting and moderation</Text></Pressable>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({ root:{flex:1,backgroundColor:"#F5F6F7"}, header:{height:60,backgroundColor:"#FFF",borderBottomWidth:1,borderBottomColor:"#E5E7EB",paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between"}, title:{fontSize:20,fontWeight:"700",color:"#101828"}, content:{padding:18,paddingBottom:40}, sheet:{backgroundColor:"#FFF",borderRadius:18,padding:22}, heading:{fontSize:24,fontWeight:"800",color:"#101828"}, description:{fontSize:14,color:"#667085",lineHeight:21,marginTop:10}, label:{fontSize:14,fontWeight:"700",color:"#344054",marginTop:22,marginBottom:8}, reason:{minHeight:48,flexDirection:"row",alignItems:"center",gap:12}, radio:{width:22,height:22,borderRadius:11,borderWidth:2,borderColor:"#98A2B3",alignItems:"center",justifyContent:"center"}, radioSelected:{borderColor:"#1877F2"}, radioDot:{width:10,height:10,borderRadius:5,backgroundColor:"#1877F2"}, reasonText:{fontSize:16,color:"#101828"}, input:{minHeight:110,borderWidth:1,borderColor:"#D0D5DD",borderRadius:12,padding:12,textAlignVertical:"top",fontSize:15,color:"#101828"}, checkboxRow:{flexDirection:"row",alignItems:"flex-start",gap:12,marginTop:22}, checkbox:{width:23,height:23,borderRadius:6,borderWidth:2,borderColor:"#98A2B3",alignItems:"center",justifyContent:"center"}, checkboxOn:{backgroundColor:"#1877F2",borderColor:"#1877F2"}, check:{color:"#FFF",fontWeight:"800"}, checkboxTitle:{fontSize:16,fontWeight:"700",color:"#101828"}, checkboxSub:{fontSize:13,color:"#667085",lineHeight:18,marginTop:3}, reportButton:{height:52,borderRadius:12,backgroundColor:"#1877F2",alignItems:"center",justifyContent:"center",marginTop:26}, reportButtonText:{color:"#FFF",fontSize:17,fontWeight:"800"}, disabled:{opacity:.45}, learn:{textAlign:"center",color:"#1877F2",fontWeight:"700",marginTop:18,fontSize:14} });
