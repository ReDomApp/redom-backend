import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../../assets/brand/redom-logo.svg";
import LockedKey from "../../assets/auth/locked-key.svg";
import EmailIcon from "../../assets/auth/email.svg";
import { useLanguage } from "../../i18n/LanguageProvider";
import { authService } from "../../auth/service";
import { detectPublicIp } from "../../auth/publicIp";
import { REGISTRATION_EMAIL_PROVIDERS, getRegistrationEmailProvider, normalizeRegistrationEmail } from "../../data/registrationEmailProviders";
import { getDeviceId } from "../../utils/device";
import type { RootStackParamList } from "../../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationEmail">;
const BLUE = "#1877F2", TEXT = "#1C1E21", MUTED = "#65676B", BORDER = "#CCD0D5", ERROR = "#E41E3F";
const flowMask = (value: string) => `${value.slice(0, 4)}${"•".repeat(Math.max(0, value.length - 4))}√`;

export function RegistrationEmailScreen({ navigation, route }: Props) {
  const { flowId } = route.params; const { t } = useLanguage(); const [email, setEmail] = useState(""); const [focused, setFocused] = useState(false); const [busy, setBusy] = useState(false); const [success, setSuccess] = useState(false); const [error, setError] = useState<string | null>(null); const [phase, setPhase] = useState("Ready to save"); const spin = useRef(new Animated.Value(0)).current;
  const provider = useMemo(() => getRegistrationEmailProvider(email), [email]); const canContinue = email.trim().length >= 5 && !busy && !success; const allowedText = REGISTRATION_EMAIL_PROVIDERS.map((item) => `${item.name}: ${item.domains.join(", ")}`).join("  •  ");

  async function continueWithEmail() {
    if (!canContinue) return;
    const normalized = normalizeRegistrationEmail(email); setError(null); setBusy(true); setSuccess(false); spin.setValue(0);
    const animation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 850, easing: Easing.linear, useNativeDriver: true })); animation.start();
    try {
      setPhase("Checking email characters…"); await new Promise((r) => setTimeout(r, 350));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Please enter a valid email address.");
      setPhase("Checking lowercase format…"); await new Promise((r) => setTimeout(r, 350));
      if (normalized !== email.trim()) throw new Error("Please use lowercase characters in your email address.");
      setPhase("Checking supported email provider…"); await new Promise((r) => setTimeout(r, 450));
      if (!provider) throw new Error("ReDom doesn't accept unaffiliated email addresses. Please use a Google, Microsoft, or Yahoo email address from the supported list below.");
      setPhase("Detecting your public IP address…");
      const ip = await detectPublicIp();
      setPhase("Checking network security details…");
      const deviceId = await getDeviceId();
      setPhase("Saving email and network details to your Flow ID…");
      await authService.saveRegistrationFlowEmail({ reservationId: route.params.reservationId, flowId, deviceId, email: normalized, ip });
      setPhase("Email and network details saved"); setSuccess(true); await new Promise((r) => setTimeout(r, 250));
      navigation.replace("RegistrationPassword", route.params);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save this email address."); setPhase("Ready to save");
    } finally { animation.stop(); setBusy(false); }
  }

  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <View style={styles.overlay}><View style={styles.sheet}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={10}><Text style={styles.backArrow}>‹</Text></Pressable><Text style={styles.title}>What's your email?</Text><Text style={styles.description}>Enter the email where you can be contacted. Nobody will see this on your profile.</Text><View style={[styles.field, focused && styles.fieldFocused]}><Animated.Text style={[styles.label, (focused || email.length > 0) && styles.labelFloating]}>Email Address</Animated.Text><TextInput value={email} onChangeText={(value) => { setEmail(value.toLowerCase()); setError(null); setSuccess(false); }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" placeholder={focused || email.length > 0 ? "" : "Email Address"} placeholderTextColor="#8A8D91" style={styles.input} editable={!busy && !success} maxLength={320}/></View><Text style={styles.providerHint}>Supported email providers</Text><Text style={styles.providerList}>{allowedText}</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable onPress={() => void continueWithEmail()} disabled={!canContinue} style={[styles.button, !canContinue && styles.disabled]}>{busy ? <ActivityIndicator color="#FFF"/> : <Text style={styles.buttonText}>{success ? "Email Saved" : "Continue"}</Text>}</Pressable><Pressable onPress={() => navigation.goBack()} disabled={busy} style={styles.phoneLink}><Text style={styles.muted}>Don't have email?</Text><Text style={styles.link}>Sign up with Mobile Number</Text></Pressable><View style={styles.progress}>{[0,1,2,3,4,5].map((i) => <View key={i} style={[styles.dot, i <= 4 && styles.activeDot]}/>)}</View><View style={styles.footerBottom}><ReDomLogo width={66} height={19}/><View style={styles.flowMeta}><Text numberOfLines={1} style={styles.flowMetaText}>Flow ID: {flowMask(flowId)}</Text>{route.params.expiresAt ? <Text style={styles.flowMetaText}>{Math.max(0,Math.ceil((new Date(route.params.expiresAt).getTime()-Date.now())/60000))} min left</Text> : null}</View></View></ScrollView></View>{busy ? <View style={styles.phaseOverlay} pointerEvents="none"><View style={styles.phaseCard}><Animated.View style={[styles.spinner,{transform:[{rotate:rotation}]}]}><View style={styles.spinnerTrack}/></Animated.View><View style={styles.emailIconCircle}><EmailIcon width={34} height={34}/></View><Text style={styles.phaseTitle}>{phase}</Text><Text style={styles.phaseBody}>ReDom is securely validating your email and checking the current network connection before saving the registration details.</Text></View></View> : null}</View>;
}
const styles = StyleSheet.create({
  overlay:{flex:1,backgroundColor:"#FFFFFF",justifyContent:"flex-start"},
  sheet:{flex:1,width:"100%",backgroundColor:"#FFFFFF",borderTopLeftRadius:0,borderTopRightRadius:0},
  content:{flexGrow:1,width:"100%",maxWidth:520,alignSelf:"center",alignItems:"stretch",paddingHorizontal:0,paddingTop:4,paddingBottom:24},
  backButton:{width:42,height:42,justifyContent:"center",alignItems:"flex-start",marginBottom:24},
  backArrow:{fontSize:43,lineHeight:44,fontWeight:"300",color:"#111111",marginTop:-4},
  title:{color:"#111111",fontSize:30,lineHeight:37,fontWeight:"800",textAlign:"left",letterSpacing:-.7,marginBottom:9},
  description:{color:TEXT,fontSize:17,lineHeight:25,textAlign:"left",marginTop:0,marginBottom:22},
  small:{color:MUTED,fontSize:14,lineHeight:21,marginTop:4,marginBottom:20},
  field:{width:"100%",height:68,borderWidth:1.4,borderColor:"#DADDE1",borderRadius:18,paddingHorizontal:16,justifyContent:"center",position:"relative",backgroundColor:"#FFFFFF"},
  fieldFocused:{borderColor:BLUE,borderWidth:1.8},
  label:{position:"absolute",left:16,color:"#8A8D91",fontSize:16,top:22},
  labelFloating:{top:-9,left:11,paddingHorizontal:6,backgroundColor:"#FFFFFF",color:BLUE,fontSize:11,fontWeight:"800"},
  input:{width:"100%",height:34,color:TEXT,fontSize:16,padding:0,marginTop:7},
  providerHint:{width:"100%",color:TEXT,fontSize:13,fontWeight:"800",marginTop:14},
  providerList:{width:"100%",color:MUTED,fontSize:11.5,lineHeight:18,marginTop:5},
  error:{width:"100%",color:ERROR,fontSize:13,lineHeight:19,fontWeight:"600",marginTop:12},
  button:{width:"100%",height:58,borderRadius:30,backgroundColor:BLUE,alignItems:"center",justifyContent:"center",marginTop:24,shadowColor:BLUE,shadowOpacity:.14,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:2},
  buttonText:{color:"#FFFFFF",fontSize:17,fontWeight:"700",letterSpacing:.1},
  disabled:{opacity:.5},
  phoneLink:{alignItems:"center",marginTop:17,gap:4,paddingVertical:5},
  muted:{color:MUTED,fontSize:14},
  link:{color:"#2167B2",fontSize:14,fontWeight:"700"},
  progress:{flexDirection:"row",justifyContent:"center",gap:8,marginTop:24},
  dot:{width:8,height:8,borderRadius:4,backgroundColor:"#D8DCE1"},
  activeDot:{width:24,backgroundColor:BLUE},
  footerBottom:{width:"100%",flexDirection:"row",alignItems:"center",justifyContent:"space-between",minHeight:22,marginTop:18},
  flowMeta:{alignItems:"flex-end",flexShrink:1,maxWidth:"68%"},
  flowMetaText:{color:"#A0A4AA",fontSize:8,lineHeight:10,letterSpacing:.1},
  phaseOverlay:{position:"absolute",left:0,right:0,top:0,bottom:0,backgroundColor:"rgba(0,0,0,.46)",alignItems:"center",justifyContent:"center",padding:24},
  phaseCard:{width:"100%",maxWidth:350,borderRadius:24,backgroundColor:"#FFFFFF",padding:26,alignItems:"center"},
  spinner:{position:"absolute",width:94,height:94,borderRadius:47,alignItems:"center",justifyContent:"center"},
  spinnerTrack:{width:94,height:94,borderRadius:47,borderWidth:4,borderColor:BLUE,borderRightColor:"transparent",borderBottomColor:"transparent"},
  emailIconCircle:{width:68,height:68,borderRadius:34,backgroundColor:"#F1F3F6",alignItems:"center",justifyContent:"center"},
  phaseTitle:{color:TEXT,fontSize:18,lineHeight:23,fontWeight:"800",textAlign:"center",marginTop:19},
  phaseBody:{color:MUTED,fontSize:13,lineHeight:19,textAlign:"center",marginTop:7}
});
