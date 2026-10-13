import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../../assets/brand/redom-logo.svg";
import { authService } from "../../auth/service";
import { getDeviceId } from "../../utils/device";
import type { RootStackParamList } from "../../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationVerification">;
type Channel = "sms" | "whatsapp" | "email";
type SheetMode = "options" | "email" | "phone";
const BLUE = "#1877F2", TEXT = "#1C1E21", MUTED = "#65676B", BORDER = "#DADDE1", ERROR = "#B4233D", PALE = "#F0F2F5";
const RESEND_WAIT = 60;
function formatTimer(value: number) { return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`; }

export function RegistrationVerificationScreen({ route, navigation }: Props) {
  const [verificationChallengeId, setVerificationChallengeId] = useState(route.params.verificationChallengeId);
  const [flowId, setFlowId] = useState(route.params.flowId);
  const [channel, setChannel] = useState<Channel>(route.params.channel);
  const [maskedTarget, setMaskedTarget] = useState(route.params.maskedTarget);
  const [expiresAt, setExpiresAt] = useState(route.params.expiresAt);
  const [seconds, setSeconds] = useState(RESEND_WAIT);
  const [clock, setClock] = useState(Date.now());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetMode, setSheetMode] = useState<SheetMode>("options");
  const [newTarget, setNewTarget] = useState("");
  const sheetY = useRef(new Animated.Value(520)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const countdown = useMemo(() => formatTimer(seconds), [seconds]);
  const codeExpired = clock >= new Date(expiresAt).getTime();
  const canVerify = code.length > 0 && !busy && !verified && !codeExpired;

  useEffect(() => {
    const timer = setInterval(() => { setSeconds(v => Math.max(0, v - 1)); setClock(Date.now()); }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!sheetVisible) return;
    sheetY.setValue(520); backdrop.setValue(0);
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 190, useNativeDriver: true }),
      Animated.spring(sheetY, { toValue: 0, damping: 24, stiffness: 220, mass: 0.85, useNativeDriver: true }),
    ]).start();
  }, [sheetVisible, sheetMode, sheetY, backdrop]);

  function closeSheet() {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(sheetY, { toValue: 520, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setSheetVisible(false); });
  }

  async function verify() {
    if (!canVerify) return;
    setBusy(true); setBusyAction("verify"); setError(null);
    try {
      const result = await authService.verifyRegistrationChallenge(verificationChallengeId, code);
      if (!result.success) throw new Error(result.message || "Verification failed.");
      setVerified(true); setCode("");
      setTimeout(() => navigation.replace("CustomizingExperience", { verificationChallengeId, reservationId: route.params.reservationId, flowId }), 450);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Verification failed.";
      if (/expired/i.test(message)) setError("This code has expired. Request a new code to continue.");
      else if (/invalid|incorrect|maximum verification attempts/i.test(message)) setError(/maximum/i.test(message) ? "Too many incorrect attempts. Request a new code to continue." : "Incorrect confirmation code. Check the code and try again.");
      else setError(message);
      setCode("");
    } finally { setBusy(false); setBusyAction(""); }
  }

  async function resend(nextChannel: Channel) {
    if (seconds > 0 || busy || verified) { if (seconds > 0) setError(`Please wait ${countdown} before requesting another code.`); return; }
    setBusy(true); setBusyAction(nextChannel); setError(null);
    try {
      const deviceId = route.params.deviceId ?? await getDeviceId();
      const result = await authService.resendRegistrationVerification({ verificationChallengeId, reservationId: route.params.reservationId, flowId, deviceId, channel: nextChannel });
      setVerificationChallengeId(result.verificationChallengeId);
      setFlowId(result.rawFlowId || flowId);
      setChannel(result.channel);
      setMaskedTarget(result.maskedTarget);
      setExpiresAt(result.expiresAt);
      setSeconds(RESEND_WAIT);
      setCode("");
      closeSheet();
      setError(result.channel === "sms" && nextChannel === "whatsapp" ? "WhatsApp couldn't send the code, so ReDom sent it by SMS instead." : null);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to resend the confirmation code."); }
    finally { setBusy(false); setBusyAction(""); }
  }

  async function changeContact() {
    const target = newTarget.trim();
    if (!target) { setError(sheetMode === "email" ? "Enter the new email address." : "Enter the mobile number with its country code."); return; }
    if (seconds > 0) { setError(`Please wait ${countdown} before changing your verification destination.`); return; }
    setBusy(true); setBusyAction("contact"); setError(null);
    try {
      const deviceId = route.params.deviceId ?? await getDeviceId();
      const result = await authService.switchRegistrationVerificationContact({
        verificationChallengeId, reservationId: route.params.reservationId ?? "", flowId, deviceId,
        contactType: sheetMode === "email" ? "email" : "phone", target,
      });
      setVerificationChallengeId(result.verificationChallengeId);
      setFlowId(result.rawFlowId || flowId);
      setChannel(result.channel);
      setMaskedTarget(result.maskedTarget);
      setExpiresAt(result.expiresAt);
      setSeconds(RESEND_WAIT);
      setCode(""); setNewTarget(""); closeSheet();
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to change the verification destination."); }
    finally { setBusy(false); setBusyAction(""); }
  }

  function logout() {
    Alert.alert("Log out of registration?", "Your pending verification and temporary registration session will be cancelled.", [
      { text: "Stay here", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => { void (async () => {
        setBusy(true); setBusyAction("logout"); setError(null);
        try {
          const deviceId = route.params.deviceId ?? await getDeviceId();
          await authService.cancelRegistrationVerification({ verificationChallengeId, reservationId: route.params.reservationId, flowId, deviceId });
          closeSheet();
          navigation.replace("Login");
        } catch (e) { setError(e instanceof Error ? e.message : "We couldn't cancel this registration session. Please try again."); }
        finally { setBusy(false); setBusyAction(""); }
      })(); } },
    ]);
  }

  const destinationKind = channel === "email" ? "email" : channel === "whatsapp" ? "WhatsApp" : "SMS";
  const resendDisabled = seconds > 0 || busy || verified;
  const Option = ({ label, onPress, disabled = false, detail }: { label: string; onPress: () => void; disabled?: boolean; detail?: string }) => (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.option, pressed && !disabled && s.optionPressed, disabled && s.optionDisabled]}>
      <View style={s.optionTextWrap}><Text style={s.optionText}>{label}</Text>{detail ? <Text style={s.optionDetail}>{detail}</Text> : null}</View>
      {busy && busyAction === label ? <ActivityIndicator color={BLUE} /> : <Text style={s.chevron}>›</Text>}
    </Pressable>
  );

  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Pressable accessibilityLabel="Close verification" onPress={logout} style={s.closeTop}><Text style={s.closeGlyph}>×</Text></Pressable>
      <Text style={s.title}>{verified ? "Confirmation complete" : "Enter the confirmation code"}</Text>
      <Text style={s.description}>{verified ? "Your contact has been verified. ReDom is preparing your account." : <>To confirm your account, enter the code we sent to <Text style={s.target}>{maskedTarget}</Text>.</>}</Text>
      {!verified ? <>
        <View style={[s.field, code.length > 0 && s.fieldFilled, !!error && s.fieldError]}>
          <TextInput value={code} onChangeText={v => { setCode(v.replace(/\D/g, "").slice(0, 9)); setError(null); }} keyboardType="number-pad" maxLength={9} autoFocus style={s.input} placeholder="Confirmation code" placeholderTextColor="#777B80" editable={!busy && !codeExpired} returnKeyType="done" onSubmitEditing={() => void verify()} accessibilityLabel="Confirmation code" />
          {code.length > 0 ? <Pressable accessibilityLabel="Clear code" onPress={() => { setCode(""); setError(null); }} style={s.clearCode}><Text style={s.clearGlyph}>×</Text></Pressable> : null}
        </View>
        {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
        <Text style={s.expiry}>{codeExpired ? "This code has expired." : `Code expires in ${formatTimer(Math.max(0, Math.ceil((new Date(expiresAt).getTime() - clock) / 1000)))}`}</Text>
        <Pressable disabled={!canVerify} onPress={() => void verify()} style={[s.primary, !canVerify && s.disabled]}>{busy && busyAction === "verify" ? <ActivityIndicator color="#FFF" /> : <Text style={s.primaryText}>Next</Text>}</Pressable>
        <Pressable disabled={busy} onPress={() => { setSheetMode("options"); setSheetVisible(true); }} style={[s.secondary, busy && s.disabled]}><Text style={s.secondaryText}>I didn't get the code</Text></Pressable>
      </> : <View style={s.successCard}><Text style={s.successTitle}>Verified successfully</Text><Text style={s.successBody}>Your verification is complete. ReDom is preparing your account and session.</Text><ActivityIndicator color={BLUE} style={{ marginTop: 14 }} /></View>}
      <View style={s.footer}><ReDomLogo width={84} height={24}/><Text style={s.footerText}>ReDom · Secure account verification</Text></View>
    </ScrollView>
    <Modal visible={sheetVisible} transparent animationType="none" statusBarTranslucent onRequestClose={closeSheet}>
      <View style={s.modalRoot}>
        <Animated.View style={[s.backdrop, { opacity: backdrop }]}><Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} /></Animated.View>
        <Animated.View style={[s.sheet, { transform: [{ translateY: sheetY }] }]}>
          <View style={s.handle} />
          <View style={s.sheetHeader}><Pressable accessibilityLabel="Close options" onPress={closeSheet} style={s.sheetClose}><Text style={s.closeGlyph}>×</Text></Pressable><Text style={s.sheetHeading}>{sheetMode === "options" ? "Didn't get the code?" : sheetMode === "email" ? "Change email" : "Confirm by mobile number"}</Text></View>
          {sheetMode === "options" ? <>
            {channel !== "email" ? <>
              <Option label="Resend Code via WhatsApp" detail={seconds > 0 ? `Try again in ${countdown}` : "We'll try WhatsApp first, then SMS if needed."} disabled={resendDisabled} onPress={() => void resend("whatsapp")} />
              <Option label="Resend Code via SMS" detail={seconds > 0 ? `Available in ${countdown}` : "Send a new code by text message."} disabled={resendDisabled} onPress={() => void resend("sms")} />
              <Option label="Change phone number" onPress={() => { setNewTarget(""); setSheetMode("phone"); }} disabled={busy} />
            </> : <>
              <Option label="Resend confirmation code" detail={seconds > 0 ? `Available in ${countdown}` : "Send a new code to this email."} disabled={resendDisabled} onPress={() => void resend("email")} />
              <Option label="Change email" onPress={() => { setNewTarget(""); setSheetMode("email"); }} disabled={busy} />
              <Option label="Confirm by mobile number" onPress={() => { setNewTarget(""); setSheetMode("phone"); }} disabled={busy} />
            </>}
            <Option label="Log out" detail="Cancel this registration and return to login." onPress={logout} disabled={busy} />
          </> : <>
            <Text style={s.formHelp}>{sheetMode === "email" ? "Enter the new email address where you want ReDom to send your confirmation code." : "Enter a mobile number in international format, including the + country code."}</Text>
            <TextInput autoFocus value={newTarget} onChangeText={setNewTarget} keyboardType={sheetMode === "email" ? "email-address" : "phone-pad"} autoCapitalize="none" autoCorrect={false} placeholder={sheetMode === "email" ? "name@example.com" : "+1 555 123 4567"} placeholderTextColor="#8A8D91" style={s.contactInput} editable={!busy} />
            {error ? <Text style={s.error}>{error}</Text> : null}
            <Pressable disabled={busy || seconds > 0 || !newTarget.trim()} onPress={() => void changeContact()} style={[s.primary, (busy || seconds > 0 || !newTarget.trim()) && s.disabled]}>{busy && busyAction === "contact" ? <ActivityIndicator color="#FFF" /> : <Text style={s.primaryText}>{seconds > 0 ? `Try again in ${countdown}` : "Send confirmation code"}</Text>}</Pressable>
            <Pressable disabled={busy} onPress={() => { setSheetMode("options"); setError(null); }} style={s.backButton}><Text style={s.backText}>Back to options</Text></Pressable>
          </>}
          <Text style={s.sheetFootnote}>For your security, codes expire after 10 minutes. Resend limits apply.</Text>
        </Animated.View>
      </View>
    </Modal>
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:"#FFF"},content:{flexGrow:1,width:"100%",maxWidth:480,alignSelf:"center",paddingHorizontal:22,paddingTop:24,paddingBottom:28},
  closeTop:{width:42,height:42,justifyContent:"center",marginBottom:28},closeGlyph:{fontSize:36,lineHeight:40,color:"#151515",fontWeight:"300"},title:{fontSize:29,lineHeight:36,fontWeight:"800",color:"#111",letterSpacing:-.5},description:{fontSize:17,lineHeight:25,color:TEXT,marginTop:20},target:{fontWeight:"700",color:TEXT},
  field:{minHeight:76,borderWidth:1.5,borderColor:"#8A8D91",borderRadius:22,marginTop:44,flexDirection:"row",alignItems:"center",paddingLeft:18,paddingRight:12},fieldFilled:{borderColor:BLUE},fieldError:{borderColor:ERROR},input:{flex:1,minHeight:70,fontSize:18,color:TEXT,paddingVertical:16},clearCode:{width:36,height:42,alignItems:"center",justifyContent:"center"},clearGlyph:{fontSize:31,color:"#777B80",fontWeight:"300"},
  expiry:{fontSize:12.5,color:MUTED,marginTop:12},primary:{minHeight:58,borderRadius:32,backgroundColor:BLUE,alignItems:"center",justifyContent:"center",marginTop:26,paddingHorizontal:16},primaryText:{fontSize:17,color:"#FFF",fontWeight:"700"},secondary:{minHeight:58,borderRadius:32,backgroundColor:PALE,alignItems:"center",justifyContent:"center",marginTop:16,paddingHorizontal:16},secondaryText:{fontSize:16.5,color:TEXT,fontWeight:"600"},disabled:{opacity:.5},error:{color:ERROR,fontSize:13.5,lineHeight:19,fontWeight:"600",marginTop:12},successCard:{marginTop:30,padding:22,borderRadius:18,backgroundColor:"#F0F8FF",alignItems:"center"},successTitle:{fontSize:19,fontWeight:"800",color:BLUE},successBody:{fontSize:14,lineHeight:21,color:TEXT,textAlign:"center",marginTop:8},footer:{alignItems:"center",gap:8,marginTop:"auto",paddingTop:58},footerText:{fontSize:11.5,color:MUTED},
  modalRoot:{flex:1,justifyContent:"flex-end"},backdrop:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(0,0,0,0.55)"},sheet:{backgroundColor:"#FFF",borderTopLeftRadius:30,borderTopRightRadius:30,paddingHorizontal:22,paddingTop:10,paddingBottom:Math.max(24,Platform.OS==="ios"?32:22),maxHeight:"82%"},handle:{width:38,height:5,borderRadius:3,backgroundColor:"#D0D3D7",alignSelf:"center",marginBottom:18},sheetHeader:{flexDirection:"row",alignItems:"center",marginBottom:14},sheetClose:{width:38,height:42,justifyContent:"center"},sheetHeading:{fontSize:20,fontWeight:"800",color:TEXT,marginLeft:4,flex:1},option:{minHeight:66,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderWidth:1,borderColor:"#E4E6E9",borderRadius:14,paddingHorizontal:16,marginTop:9},optionPressed:{backgroundColor:"#F5F7FA"},optionDisabled:{opacity:.55},optionTextWrap:{flex:1,paddingVertical:10},optionText:{fontSize:15.5,color:TEXT,fontWeight:"600"},optionDetail:{fontSize:12,color:MUTED,marginTop:4,lineHeight:17},chevron:{fontSize:27,color:"#8A8D91",marginLeft:12},formHelp:{fontSize:14.5,lineHeight:21,color:TEXT,marginTop:4,marginBottom:14},contactInput:{minHeight:58,borderWidth:1.5,borderColor:BORDER,borderRadius:14,paddingHorizontal:16,fontSize:16,color:TEXT},backButton:{alignItems:"center",padding:14},backText:{fontSize:14,color:BLUE,fontWeight:"700"},sheetFootnote:{fontSize:11.5,lineHeight:17,color:MUTED,textAlign:"center",marginTop:16}
});
