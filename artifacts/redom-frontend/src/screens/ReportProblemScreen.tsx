import { useMemo, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { Alert, Image, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { useAuthContext } from "../auth/context";
import { bugReportService, type ProblemReportAttachment } from "../reporting/bugReportService";
import ReportTechnicalIcon from "../assets/home-feed/report-technical.svg";
import ReportDiagnosticsIcon from "../assets/home-feed/report-diagnostics.svg";
import ReportCameraIcon from "../assets/home-feed/report-camera.svg";
import ReportVideoIcon from "../assets/home-feed/report-video.svg";
import ReportSendIcon from "../assets/home-feed/report-send.svg";

type Props = NativeStackScreenProps<RootStackParamList, "ReportProblem">;
type Stage = "intro" | "diagnostics" | "product" | "form";
type Attachment = ProblemReportAttachment & { previewUri?: string };

const products = [
  "Buy and sell groups", "Camera", "Check ins or places", "Checkout / payments", "Data modes", "Events",
  "Feed", "Friend Requests", "Games or Apps", "Gaming", "Groups", "Huddle", "Live", "Marketplace", "Messages",
  "Pages", "Photos", "Place search or local", "Preventive health", "Privacy", "Profile",
  "Reactive Media / 3D & 360 Photo", "Search", "Settings", "Stars", "Status Update", "Stories",
  "Subscriptions", "Video", "Videos",
];

const categories = ["Bug / error", "Crash", "Feature not working", "Performance", "Login / account", "Other"];

async function dataUriFromFile(uri: string, contentType: string): Promise<string> {
  const bytes = await (await fetch(uri)).arrayBuffer();
  let binary = "";
  const array = new Uint8Array(bytes);
  for (let i = 0; i < array.length; i += 0x8000) binary += String.fromCharCode(...array.subarray(i, i + 0x8000));
  return `data:${contentType};base64,${btoa(binary)}`;
}

export function ReportProblemScreen({}: Props) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const navigation = useNavigation();
  const { user } = useAuthContext();
  const [stage, setStage] = useState<Stage>("intro");
  const [includeDiagnostics, setIncludeDiagnostics] = useState<boolean | null>(null);
  const [product, setProduct] = useState("");
  const [category, setCategory] = useState("Bug / error");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);

  const diagnostics = useMemo(() => ({
    app: "ReDom",
    appVersion: Constants.expoConfig?.version ?? "unknown",
    runtimeVersion: typeof Constants.expoConfig?.runtimeVersion === "string" ? Constants.expoConfig.runtimeVersion : "unknown",
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    locale: String(Constants.expoConfig?.extra?.locale ?? "unknown"),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    account: user ? {
      publicId: user.publicId,
      profileId: user.profileId,
      username: user.username,
      accountStatus: user.accountStatus,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
    } : null,
    reportScreen: "Help & Support > Report a problem",
  }), [user]);

  const addAttachment = async (kind: "image" | "video") => {
    try {
      if (attachments.length >= 3) return Alert.alert("Attachments", "You can include up to 3 screenshots or videos.");
      if (kind === "image") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) return Alert.alert("Photos", "Photo access is required to attach a screenshot.");
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.85, base64: true });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        const contentType = asset.mimeType || "image/jpeg";
        const data = asset.base64 ? `data:${contentType};base64,${asset.base64}` : await dataUriFromFile(asset.uri, contentType);
        if (data.length * 0.75 > 10 * 1024 * 1024) return Alert.alert("File too large", "Each attachment must be 10 MB or smaller.");
        setAttachments((current) => [...current, { filename: `screenshot-${Date.now()}.jpg`, contentType, data, previewUri: asset.uri }]);
      } else {
        const result = await DocumentPicker.getDocumentAsync({ type: "video/*", multiple: false, copyToCacheDirectory: true });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        if ((asset.size ?? 0) > 10 * 1024 * 1024) return Alert.alert("Video too large", "Each attachment must be 10 MB or smaller.");
        const contentType = asset.mimeType || "video/mp4";
        const data = await dataUriFromFile(asset.uri, contentType);
        if (data.length * 0.75 > 10 * 1024 * 1024) return Alert.alert("Video too large", "Each attachment must be 10 MB or smaller.");
        setAttachments((current) => [...current, { filename: asset.name || `screen-recording-${Date.now()}.mp4`, contentType, data, previewUri: asset.uri }]);
      }
    } catch (error) {
      Alert.alert("Attachment", error instanceof Error ? error.message : "Unable to add the attachment.");
    }
  };

  const submit = async () => {
    if (!product) return Alert.alert("Select product", "Choose the ReDom product where you saw the problem.");
    if (!description.trim()) return Alert.alert("Describe the issue", "Tell us what happened and what you expected to happen.");
    setSending(true);
    try {
      const result = await bugReportService.submit({
        product,
        category,
        description: description.trim(),
        includeDiagnostics: includeDiagnostics === true,
        diagnostics: includeDiagnostics === true ? diagnostics : null,
        attachments: attachments.map(({ filename, contentType, data }) => ({ filename, contentType, data })),
      });
      const statusMessage = result.report.emailStatus === "sent"
        ? "Your report was submitted to the ReDom administrators."
        : "Your report was saved, but email delivery could not be confirmed.";
      Alert.alert("Report submitted", `${statusMessage}\n\nReport ID: ${result.report.reportId}`, [{ text: "OK", onPress: () => navigation.goBack() }]);
    } catch (error) {
      Alert.alert("Report problem", error instanceof Error ? error.message : "Unable to submit your report.");
    } finally {
      setSending(false);
    }
  };

  const headerTitle = stage === "intro" ? "Report a problem" : stage === "diagnostics" ? "Report technical problem" : stage === "product" ? "Select product" : "Send report";

  return <SafeAreaView style={s.root}>
    <View style={s.header}>
      <Pressable onPress={() => stage === "intro" ? navigation.goBack() : setStage(stage === "diagnostics" ? "intro" : stage === "product" ? "diagnostics" : "product")}><Text style={s.back}>‹</Text></Pressable>
      <Text style={s.headerTitle}>{headerTitle}</Text>
      <View style={{ width: 34 }} />
    </View>

    {stage === "intro" ? <ScrollView contentContainerStyle={s.intro}>
      <View style={s.hero}><ReportTechnicalIcon width={86} height={86}/><Text style={s.heroTitle}>Go back to where you saw an issue and shake your phone</Text><Text style={s.heroText}>Did you encounter a problem? Please shake your phone where you see it to help us find and fix the issue faster.</Text></View>
      <Pressable style={s.primary} onPress={() => setStage("diagnostics")}><Text style={s.primaryText}>Continue to report a problem</Text></Pressable>
      <View style={s.warning}><Text style={s.warningTitle}>Reports about abuse or spam shouldn't be submitted here</Text><Text style={s.warningText}>Use ReDom's safety reporting controls for violence, criminal behavior, offensive content, or safety issues.</Text></View>
      <Pressable style={s.linkRow} onPress={() => navigation.navigate("Policy", { slug: "support" })}><Text style={s.link}>Learn about ReDom Support & Reporting</Text></Pressable>
    </ScrollView> : null}

    {stage === "diagnostics" ? <ScrollView contentContainerStyle={s.page}>
      <ReportDiagnosticsIcon width={72} height={72} />
      <Text style={s.title}>Include complete logs and diagnostics in your report?</Text>
      <Text style={s.body}>Information about your device, account and this app related to the issue can be included to help ReDom understand and resolve the problem.</Text>
      <Text style={s.body}>If you choose Include, ReDom sends the safe diagnostic information shown below with your report. Passwords, access tokens and private message content are never included by this screen.</Text>
      <View style={s.diagnosticCard}><Text style={s.cardTitle}>Included diagnostics</Text><Text style={s.mono}>{JSON.stringify(diagnostics, null, 2)}</Text></View>
      <Pressable style={s.primary} onPress={() => { setIncludeDiagnostics(true); setStage("product"); }}><Text style={s.primaryText}>Include</Text></Pressable>
      <Pressable style={s.secondary} onPress={() => { setIncludeDiagnostics(false); setStage("product"); }}><Text style={s.secondaryText}>Don't include</Text></Pressable>
      <Pressable onPress={() => navigation.navigate("Policy", { slug: "privacy" })}><Text style={s.link}>Learn more about ReDom Privacy Policy</Text></Pressable>
    </ScrollView> : null}

    {stage === "product" ? <ScrollView contentContainerStyle={s.productPage}>
      {products.map((item) => <Pressable key={item} style={[s.productRow, product === item && s.productSelected]} onPress={() => { setProduct(item); setStage("form"); }}><Text style={s.productText}>{item}</Text>{product === item ? <Text style={s.check}>✓</Text> : null}</Pressable>)}
    </ScrollView> : null}

    {stage === "form" ? <ScrollView contentContainerStyle={s.form}>
      <View style={s.selectedProduct}><Text style={s.smallLabel}>PRODUCT</Text><Text style={s.selectedText}>{product}</Text></View>
      <Text style={s.section}>What type of problem is this?</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{categories.map((item) => <Pressable key={item} style={[s.chip, category === item && s.chipActive]} onPress={() => setCategory(item)}><Text style={[s.chipText, category === item && s.chipTextActive]}>{item}</Text></Pressable>)}</ScrollView>
      <TextInput value={description} onChangeText={setDescription} placeholder="Describe the issue..." placeholderTextColor="#65676B" multiline style={s.description}/>
      <Pressable style={s.mediaButton} onPress={() => Alert.alert("Record screen", "Use your device's screen recorder, then return here to attach the recording.", [{ text: "Cancel", style: "cancel" }, { text: "Choose video", onPress: () => void addAttachment("video") }])}><ReportVideoIcon width={28} height={28}/><Text style={s.mediaText}>Record screen</Text></Pressable>
      <Pressable style={s.mediaButton} onPress={() => void addAttachment("image")}><ReportCameraIcon width={28} height={28}/><Text style={s.mediaText}>Upload screenshot</Text></Pressable>
      <Pressable style={s.mediaButton} onPress={() => void addAttachment("video")}><ReportVideoIcon width={28} height={28}/><Text style={s.mediaText}>Upload video from phone</Text></Pressable>
      {attachments.map((item, index) => <View key={item.filename + index} style={s.attachment}><View style={s.attachmentPreview}>{item.contentType.startsWith("image/") && item.previewUri ? <Image source={{ uri: item.previewUri }} style={s.preview}/> : <ReportVideoIcon width={34} height={34}/>}</View><View style={{ flex: 1 }}><Text style={s.attachmentName} numberOfLines={1}>{item.filename}</Text><Text style={s.attachmentType}>{item.contentType}</Text></View><Pressable onPress={() => setAttachments((current) => current.filter((_, i) => i !== index))}><Text style={s.remove}>×</Text></Pressable></View>)}
      <Pressable onPress={() => navigation.navigate("Policy", { slug: "privacy" })}><Text style={s.privacy}>Learn more about ReDom Privacy Policy.</Text></Pressable>
      <Pressable style={[s.primary, sending && s.disabled]} disabled={sending} onPress={() => void submit()}><ReportSendIcon width={25} height={25}/><Text style={s.primaryText}>{sending ? "Sending report…" : "Send report"}</Text></Pressable>
      <Text style={s.footer}>Your report receives a unique 10-digit Report ID. The report includes the problem, product, category and the fix required for administrators to investigate. Screenshots or videos are included only when you attach them.</Text>
    </ScrollView> : null}
  </SafeAreaView>;
}

function makeStyles(colors:ReturnType<typeof useTheme>["colors"]){return StyleSheet.create({
  root:{flex:1,backgroundColor:colors.surface}, header:{height:58,borderBottomWidth:1,borderBottomColor:colors.border,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:12,backgroundColor:colors.surface}, back:{fontSize:38,color:colors.text,lineHeight:42},headerTitle:{fontSize:19,fontWeight:"800",color:colors.text},
  intro:{padding:24,paddingBottom:48},hero:{alignItems:"center",paddingTop:18,paddingBottom:24},heroTitle:{fontSize:25,fontWeight:"800",color:colors.text,textAlign:"center",lineHeight:31,marginTop:18},heroText:{fontSize:17,color:colors.text,textAlign:"center",lineHeight:25,marginTop:12},primary:{minHeight:54,borderRadius:10,backgroundColor:colors.primary,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:10,marginTop:12,paddingHorizontal:18},primaryText:{color:"#FFF",fontSize:17,fontWeight:"800"},secondary:{minHeight:54,borderRadius:10,backgroundColor:colors.surfaceSecondary,alignItems:"center",justifyContent:"center",marginTop:12},secondaryText:{color:colors.text,fontSize:17,fontWeight:"700"},warning:{marginTop:22,padding:16,borderTopWidth:1,borderTopColor:colors.border},warningTitle:{fontSize:17,fontWeight:"800",color:colors.text,lineHeight:23},warningText:{fontSize:15,color:colors.textSecondary,lineHeight:22,marginTop:7},linkRow:{paddingVertical:18},link:{color:colors.primary,fontSize:16,fontWeight:"700",textAlign:"center",marginTop:16},
  page:{padding:22,paddingBottom:50},title:{fontSize:22,fontWeight:"800",color:colors.text,lineHeight:28,marginTop:12},body:{fontSize:16,color:colors.text,lineHeight:24,marginTop:12},diagnosticCard:{marginTop:18,padding:14,borderRadius:12,backgroundColor:colors.background},cardTitle:{fontSize:15,fontWeight:"800",marginBottom:8},mono:{fontFamily:Platform.OS==="ios"?"Menlo":"monospace",fontSize:11,color:colors.text,lineHeight:16},
  productPage:{paddingBottom:30},productRow:{minHeight:60,borderBottomWidth:1,borderBottomColor:colors.border,paddingHorizontal:20,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},productSelected:{backgroundColor:colors.surfaceSecondary},productText:{fontSize:16,color:colors.text},check:{fontSize:20,color:colors.primary,fontWeight:"800"},
  form:{padding:18,paddingBottom:50},selectedProduct:{backgroundColor:colors.background,borderRadius:12,padding:14},smallLabel:{fontSize:11,fontWeight:"800",color:colors.textSecondary,letterSpacing:1},selectedText:{fontSize:17,fontWeight:"700",marginTop:5,color:colors.text},section:{fontSize:17,fontWeight:"800",marginTop:20,marginBottom:8},chips:{gap:8,paddingVertical:4},chip:{paddingHorizontal:13,paddingVertical:9,borderRadius:20,backgroundColor:colors.surfaceSecondary},chipActive:{backgroundColor:colors.primary},chipText:{fontSize:13,color:colors.text},chipTextActive:{color:"#FFF",fontWeight:"700"},description:{minHeight:150,borderWidth:1,borderColor:colors.border,borderRadius:14,padding:16,fontSize:17,textAlignVertical:"top",marginTop:12,color:colors.text},mediaButton:{minHeight:54,borderRadius:10,backgroundColor:colors.surfaceSecondary,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:10,marginTop:10},mediaText:{fontSize:16,fontWeight:"700",color:colors.text},attachment:{marginTop:10,padding:10,borderRadius:10,backgroundColor:colors.background,flexDirection:"row",alignItems:"center",gap:10},attachmentPreview:{width:48,height:48,borderRadius:8,overflow:"hidden",alignItems:"center",justifyContent:"center",backgroundColor:colors.surface},preview:{width:48,height:48},attachmentName:{fontSize:14,fontWeight:"700",color:colors.text},attachmentType:{fontSize:12,color:colors.textSecondary,marginTop:2},remove:{fontSize:28,color:colors.textSecondary,paddingHorizontal:8},privacy:{fontSize:14,color:colors.textSecondary,textAlign:"center",marginTop:18},footer:{fontSize:12,color:colors.textSecondary,lineHeight:18,textAlign:"center",marginTop:18},disabled:{opacity:0.6}
}); }

