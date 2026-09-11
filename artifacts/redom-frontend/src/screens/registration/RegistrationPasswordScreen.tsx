import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../../assets/brand/redom-logo.svg";
import LockedKey from "../../assets/auth/locked-key.svg";
import InfoBlack from "../../assets/auth/info-black.svg";
import PasswordSafety from "../../assets/auth/password-safety.svg";
import PasswordSecurity from "../../assets/auth/password-security.svg";
import PasswordVisible from "../../assets/auth/password-visible.svg";
import PasswordHidden from "../../assets/auth/password-hidden.svg";
import { authService } from "../../auth/service";
import { getDeviceId } from "../../utils/device";
import type { RootStackParamList } from "../../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationPassword">;
const BLUE = "#1877F2", TEXT = "#1C1E21", MUTED = "#65676B", BORDER = "#CCD0D5", ERROR = "#E41E3F";
const flowMask = (value: string) => `${value.slice(0, 4)}${"•".repeat(Math.max(0, value.length - 4))}√`;
const classifyPassword = (value: string): "weak" | "medium" | "strong" => {
  const p = value.toLowerCase();
  if (!value || value.length < 6 || /^(123456|password|qwerty|111111|000000|abcdef|letmein)/.test(p)) return "weak";
  const letters = /[a-z]/i.test(value), numbers = /\d/.test(value);
  if (value.length >= 12 && letters && numbers) return "strong";
  if (value.length >= 8 && letters && numbers) return "medium";
  return "weak";
};

export function RegistrationPasswordScreen({ navigation, route }: Props) {
  const { flowId, reservationId, expiresAt } = route.params;
  const [password, setPassword] = useState("");
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [remember, setRemember] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  const spin = useRef(new Animated.Value(0)).current;
  const strength = useMemo(() => classifyPassword(password), [password]);
  const countdown = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const validCharacters = /^[A-Za-z0-9]*$/.test(password);
  const canContinue = password.length >= 6 && validCharacters && strength === "strong" && seconds > 0 && !busy && !saved;

  useEffect(() => { const id = setInterval(() => setSeconds(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))), 1000); return () => clearInterval(id); }, [expiresAt]);

  async function savePassword() {
    if (!canContinue) return;
    setBusy(true); setSaved(false); setError(null); spin.setValue(0);
    const animation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 850, easing: Easing.linear, useNativeDriver: true }));
    animation.start();
    try {
      const deviceId = await getDeviceId();
      await authService.saveRegistrationFlowPassword({ reservationId, flowId, deviceId, password, strength, rememberLoginInfo: remember });
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save your password."); }
    finally { animation.stop(); setBusy(false); }
  }

  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <View style={styles.root}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <ReDomLogo width={150} height={42} />
      <View style={styles.flow}><LockedKey width={20} height={20}/><Text style={styles.flowText}>{flowMask(flowId)}</Text><Text style={styles.timer}>{countdown}</Text></View>
      <Text style={styles.title}>Create A Password</Text>
      <Text style={styles.description}>Create a password with at least 6 letters or numbers.</Text>
      <Pressable onPress={() => setInfoOpen(true)} style={styles.infoRow}><InfoBlack width={20} height={20}/><Text style={styles.infoLink}>Password safety & security</Text></Pressable>

      <View style={[styles.field, focused && styles.fieldFocused]}>
        <Animated.Text style={[styles.label, (focused || password.length > 0) && styles.labelFloating]}>Input Password</Animated.Text>
        <TextInput value={password} onChangeText={(v) => { setPassword(v); setSaved(false); setError(null); }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} autoCapitalize="none" autoCorrect={false} secureTextEntry={hidden} textContentType="newPassword" autoComplete="new-password" style={styles.input} placeholder={focused || password.length > 0 ? "" : "Input Password"} placeholderTextColor="#8A8D91" editable={!busy && !saved} maxLength={128}/>
        <Pressable onPress={() => setHidden((v) => !v)} disabled={busy} style={styles.eye}>{hidden ? <PasswordVisible width={22} height={22}/> : <PasswordHidden width={22} height={22}/>}</Pressable>
      </View>

      <View style={styles.strengthBox}>
        <Text style={styles.strengthTitle}>{strength === "strong" ? "Strong password" : strength === "medium" ? "Strengthen your password" : "Weak password"}</Text>
        <View style={styles.meter}><View style={[styles.meterFill, strength === "weak" ? styles.weak : strength === "medium" ? styles.medium : styles.strong]}/></View>
        <Text style={styles.strengthBody}>{strength === "strong" ? "Good. This password is long and uses both letters and numbers." : "Use at least 6 letters or numbers. Avoid common passwords like 123456 or password. For stronger security, use 12 or more characters with letters and numbers."}</Text>
        {!validCharacters && password.length > 0 ? <Text style={styles.error}>Use letters and numbers only.</Text> : null}
      </View>

      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: remember }} onPress={() => setRemember((v) => !v)} disabled={busy} style={styles.rememberRow}><View style={[styles.checkbox, remember && styles.checked]}>{remember ? <Text style={styles.check}>✓</Text> : null}</View><Text style={styles.rememberText}>Remember login info on this device</Text></Pressable>
      <Text style={styles.rememberHint}>If enabled, your device's password manager may offer to save your login information for this device.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={() => void savePassword()} disabled={!canContinue} style={[styles.button, !canContinue && styles.disabled]}>{busy ? <Animated.View style={[styles.buttonSpinner,{transform:[{rotate:rotation}]}]}><View style={styles.spinnerArc}/></Animated.View> : <Text style={styles.buttonText}>{saved ? "Password Saved" : "Continue"}</Text>}</Pressable>

      <View style={styles.progress}>{[0,1,2,3,4,5].map((i) => <View key={i} style={[styles.dot, i <= 4 && styles.activeDot]}/>)}</View>
      <View style={styles.footer}><Text style={styles.copyright}>©</Text><ReDomLogo width={72} height={20}/></View>
    </ScrollView>

    <Modal visible={infoOpen} transparent animationType="slide" onRequestClose={() => setInfoOpen(false)}><View style={styles.modalOverlay}><View style={styles.infoSheet}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.infoContent}><View style={styles.sheetHead}><Text style={styles.sheetTitle}>Password Safety & Security</Text><Pressable onPress={() => setInfoOpen(false)}><Text style={styles.close}>Close</Text></Pressable></View><View style={styles.noteBlock}><PasswordSafety width={34} height={34}/><Text style={styles.noteTitle}>1. PASSWORD SAFETY</Text><Text style={styles.noteText}>Choose a password that is difficult for other people to guess. Do not use your name, phone number, email address, birthday, 123456, password, or another password you already use elsewhere. Never share your ReDom password with anyone, including someone claiming to be ReDom support.</Text></View><View style={styles.noteBlock}><PasswordSecurity width={34} height={34}/><Text style={styles.noteTitle}>2. PASSWORD SECURITY IN REDOM</Text><Text style={styles.noteText}>ReDom stores the password needed for your registration as a protected password hash rather than plain text. Your password is used to protect your account and should remain private. ReDom will never need you to send your password in a chat, email, or message. If you enable Remember login info, your device's supported password manager may offer to save credentials locally on your device.</Text></View><Text style={styles.learn}>Learn More</Text><Pressable onPress={() => setInfoOpen(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>Got it</Text></Pressable></ScrollView></View></View></Modal>
  </View>;
}
const styles = StyleSheet.create({ root:{flex:1,backgroundColor:"#FFF"},content:{flexGrow:1,width:"100%",maxWidth:430,alignSelf:"center",alignItems:"center",padding:22,paddingTop:36,paddingBottom:30},flow:{flexDirection:"row",alignItems:"center",gap:7,marginTop:16},flowText:{color:BLUE,fontSize:13,fontWeight:"800"},timer:{color:MUTED,fontSize:12,fontWeight:"700",marginLeft:4},title:{color:TEXT,fontSize:30,lineHeight:36,fontWeight:"800",textAlign:"center",marginTop:24},description:{color:TEXT,fontSize:15,lineHeight:22,textAlign:"center",marginTop:9},infoRow:{flexDirection:"row",alignItems:"center",gap:7,marginTop:11,marginBottom:19},infoLink:{color:TEXT,fontSize:13,fontWeight:"700",textDecorationLine:"underline"},field:{width:"100%",height:64,borderWidth:1.5,borderColor:BORDER,borderRadius:13,paddingHorizontal:14,justifyContent:"center",position:"relative"},fieldFocused:{borderColor:BLUE},label:{position:"absolute",left:14,color:"#8A8D91",fontSize:16,top:20},labelFloating:{top:-9,left:11,paddingHorizontal:6,backgroundColor:"#FFF",color:BLUE,fontSize:11,fontWeight:"800"},input:{width:"100%",height:34,color:TEXT,fontSize:16,padding:0,paddingRight:38,marginTop:4},eye:{position:"absolute",right:13,top:21},strengthBox:{width:"100%",marginTop:14,padding:14,borderRadius:13,backgroundColor:"#F5F6F7"},strengthTitle:{color:TEXT,fontSize:14,fontWeight:"800"},meter:{height:6,borderRadius:4,backgroundColor:"#D8DCE1",marginTop:9,overflow:"hidden"},meterFill:{height:"100%",borderRadius:4,width:"25%"},weak:{width:"33%"},medium:{width:"66%"},strong:{width:"100%"},strengthBody:{color:MUTED,fontSize:12.5,lineHeight:18,marginTop:8},error:{color:ERROR,fontSize:13,lineHeight:19,fontWeight:"600",marginTop:9},rememberRow:{width:"100%",flexDirection:"row",alignItems:"center",gap:10,marginTop:17},checkbox:{width:22,height:22,borderRadius:5,borderWidth:1.5,borderColor:"#8A8D91",alignItems:"center",justifyContent:"center"},checked:{backgroundColor:BLUE,borderColor:BLUE},check:{color:"#FFF",fontSize:17,fontWeight:"900",lineHeight:20},rememberText:{color:TEXT,fontSize:14,fontWeight:"600",flex:1},rememberHint:{width:"100%",color:MUTED,fontSize:11.5,lineHeight:17,marginTop:5,marginLeft:32},button:{width:"100%",height:54,borderRadius:13,backgroundColor:BLUE,alignItems:"center",justifyContent:"center",marginTop:21},buttonText:{color:"#FFF",fontSize:17,fontWeight:"800"},disabled:{opacity:.5},buttonSpinner:{width:25,height:25,alignItems:"center",justifyContent:"center"},spinnerArc:{width:25,height:25,borderRadius:13,borderWidth:3,borderColor:"#FFF",borderRightColor:"transparent",borderBottomColor:"transparent"},progress:{flexDirection:"row",justifyContent:"center",gap:8,marginTop:26},dot:{width:8,height:8,borderRadius:4,backgroundColor:"#D8DCE1"},activeDot:{width:24,backgroundColor:BLUE},footer:{alignItems:"center",gap:5,marginTop:17},copyright:{color:MUTED,fontSize:12},modalOverlay:{flex:1,backgroundColor:"rgba(0,0,0,.46)",justifyContent:"flex-end"},infoSheet:{height:"82%",backgroundColor:"#FFF",borderTopLeftRadius:28,borderTopRightRadius:28},infoContent:{padding:22,paddingBottom:34},sheetHead:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:19},sheetTitle:{color:TEXT,fontSize:21,fontWeight:"800",flex:1},close:{color:BLUE,fontSize:14,fontWeight:"800"},noteBlock:{borderWidth:1,borderColor:BORDER,borderRadius:17,padding:16,marginBottom:14},noteTitle:{color:TEXT,fontSize:14,fontWeight:"900",marginTop:10},noteText:{color:TEXT,fontSize:13.5,lineHeight:21,marginTop:7},learn:{color:BLUE,fontSize:14,fontWeight:"800",textDecorationLine:"underline",marginTop:2,marginBottom:14},closeButton:{height:50,borderRadius:13,backgroundColor:BLUE,alignItems:"center",justifyContent:"center"},closeButtonText:{color:"#FFF",fontSize:16,fontWeight:"800"}});
