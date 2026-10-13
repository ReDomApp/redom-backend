import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../../assets/brand/redom-logo.svg";
import PrimarySecurity from "../../assets/auth/primary-security.svg";
import SecurityShield from "../../assets/auth/security-shield.svg";
import CheckWhite from "../../assets/auth/check-white.svg";
import { ReDomScreen } from "../../layout/ReDomScreen";
import { AIText } from "../../i18n/AIText";
import { useLanguage } from "../../i18n/LanguageProvider";
import { authService } from "../../auth/service";
import { showReDomNotification } from "../../notifications/notificationService";
import { getDeviceId } from "../../utils/device";
import type { RootStackParamList } from "../../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationBirthday">;
const BLUE = "#1877F2";
const TEXT = "#1C1E21";
const MUTED = "#65676B";
const BORDER = "#CCD0D5";

function maskedFlowId(flowId: string) { const visible = flowId.slice(0, 4); return `${visible}${"•".repeat(Math.max(0, flowId.length - visible.length))}√`; }
function daysInMonth(year: number, month: number) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }

function WheelColumn({ values, selected, onChange, label, disabled }: { values: number[]; selected: number; onChange: (value: number) => void; label: string; disabled: boolean }) {
  const selectedIndex = Math.max(0, values.indexOf(selected));
  const ITEM_HEIGHT = 50;
  return <View style={styles.wheelWrap}><Text style={styles.wheelLabel}>{label}</Text><ScrollView style={styles.wheelViewport} scrollEnabled={!disabled} showsVerticalScrollIndicator={false} snapToInterval={ITEM_HEIGHT} decelerationRate="fast" contentContainerStyle={styles.wheelContent} onMomentumScrollEnd={(event) => { const index = Math.max(0, Math.min(values.length - 1, Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT))); onChange(values[index]!); }} contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}>{values.map((value) => <View key={value} style={[styles.wheelItem, { height: ITEM_HEIGHT }]}><Text style={[styles.wheelText, value === selected && styles.wheelTextSelected]}>{String(value).padStart(2, "0")}</Text></View>)}</ScrollView><View pointerEvents="none" style={styles.wheelSelection} /></View>;
}

export function RegistrationBirthdayScreen({ navigation, route }: Props) {
  const { t, uiMessage, localizeText } = useLanguage();
  const { reservationId, flowId, expiresAt } = route.params;
  const now = new Date();
  const [year, setYear] = useState(2010);
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [day, setDay] = useState(Math.min(now.getUTCDate(), daysInMonth(2010, now.getUTCMonth() + 1)));
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<"child" | "teen" | null>(null);
  const [warningRead, setWarningRead] = useState(false);
  const [flowLocked, setFlowLocked] = useState(false);
  const [savedFlow, setSavedFlow] = useState<{ reservationId: string; flowId: string; expiresAt: string } | null>(null);

  useEffect(() => {
    if (flowLocked) {
      setSecondsLeft(0);
      return;
    }
    const update = () => setSecondsLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, flowLocked]);

  const dateOfBirth = useMemo(() => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, [year, month, day]);
  const years = useMemo(() => Array.from({ length: 99 }, (_, index) => 2018 - index), []);
  const days = useMemo(() => Array.from({ length: daysInMonth(year, month) }, (_, index) => index + 1), [year, month]);
  const countdown = `${Math.floor(secondsLeft / 60).toString().padStart(2, "0")}:${(secondsLeft % 60).toString().padStart(2, "0")}`;
  useEffect(() => { const maxDay = daysInMonth(year, month); if (day > maxDay) setDay(maxDay); }, [year, month, day]);

  async function discontinueUnderageFlow() {
    const title = await localizeText("Registration stopped");
    const body = await localizeText(`Your ReDom registration was stopped because the birthday entered indicates that the person is under 13. Flow ID ${maskedFlowId(flowId)} has been completed and revoked and can no longer be used. You are being redirected to Login.`);
    await showReDomNotification(title, body, { type: "registration-flow-discontinued", flowId: maskedFlowId(flowId) });
    navigation.replace("Login");
  }

  async function continueRegistration() {
    if (loading || flowLocked || secondsLeft <= 0) return;
    setLoading(true); setError(null);
    try {
      const result = await authService.saveRegistrationFlowBirthday({ reservationId, flowId, deviceId: await getDeviceId(), dateOfBirth });
      const nextFlow = { reservationId: result.reservationId, flowId: result.flowId, expiresAt: result.expiresAt };
      setSavedFlow(nextFlow);
      if (result.ageBand === "underage") { setFlowLocked(true); setWarning("child"); setWarningRead(true); }
      else if (result.ageBand === "teen") { setWarning("teen"); setWarningRead(false); }
      else navigation.replace("RegistrationGender", nextFlow);
    } catch (e) { setError(e instanceof Error ? e.message : uiMessage("loginFailed")); }
    finally { setLoading(false); }
  }

  const footer = <View style={styles.footerContent}><View style={styles.loginRow}><Text style={styles.muted}>{t("alreadyAccount")} </Text><Pressable accessibilityRole="link" onPress={() => navigation.navigate("Login")} disabled={loading}><Text style={styles.link}>{t("login")}</Text></Pressable></View><View style={styles.footerBottom}><ReDomLogo width={66} height={19} /><View style={styles.flowMeta}><Text numberOfLines={1} style={styles.flowMetaText}>Flow ID: {maskedFlowId(flowId)}</Text><Text style={styles.flowExpiry}>{countdown} remaining</Text></View></View></View>;

  return <ReDomScreen footer={footer} backgroundColor="#FFFFFF"><View style={styles.content}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={10}><Text style={styles.backArrow}>‹</Text></Pressable><View style={styles.headingBlock}><Text style={styles.title}><AIText context="ReDom signup birthday title">What's your birthday?</AIText></Text><Text style={styles.description}><AIText context="ReDom signup birthday description">Choose your date of birth.</AIText></Text><Text style={styles.helper}><AIText context="ReDom signup birthday identification helper">It must be the birthday you use in everyday life.</AIText></Text></View><View style={[styles.spinnerBox, flowLocked && styles.lockedBox]}><WheelColumn label="YYYY" values={years} selected={year} onChange={setYear} disabled={flowLocked} /><WheelColumn label="MM" values={Array.from({ length: 12 }, (_, index) => index + 1)} selected={month} onChange={setMonth} disabled={flowLocked} /><WheelColumn label="DD" values={days} selected={day} onChange={setDay} disabled={flowLocked} /></View>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}<Pressable accessibilityRole="button" onPress={() => void continueRegistration()} disabled={loading || flowLocked || secondsLeft <= 0} style={[styles.button, (loading || flowLocked || secondsLeft <= 0) && styles.disabled]}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{t("continue")}</Text>}</Pressable><View style={styles.progress} accessibilityLabel={uiMessage("progress3")}>{[0,1,2,3,4,5].map((step) => <View key={step} style={[styles.dot, step <= 2 && styles.dotActive]} />)}</View></View><Modal visible={warning !== null} transparent animationType="fade" onRequestClose={() => {}}><View style={styles.modalBackdrop}><View style={styles.modalCard}>{warning === "child" ? <SecurityShield width={64} height={64} /> : <PrimarySecurity width={64} height={64} />}<Text style={styles.modalTitle}>{warning === "child" ? <AIText context="ReDom child account safety">We can't continue with this account.</AIText> : <AIText context="ReDom teen account safety">A safety reminder before you continue</AIText>}</Text><ScrollView style={styles.warningScroll} contentContainerStyle={styles.warningContent} showsVerticalScrollIndicator><AIText context={warning === "child" ? "ReDom underage protection message" : "ReDom teen safety message"} style={styles.modalBody}>{warning === "child" ? "ReDom is designed for people who meet our minimum age requirements. For your safety, this registration flow has been stopped because the birthday entered indicates that the person is under 13. Your Flow ID has been completed, revoked, and cannot continue. Select OK to return to Login." : "Because you are 13–16, we want you to use ReDom with extra care. Protect your password, avoid sharing private information with people you do not know, and tell a parent, guardian, teacher, or another trusted adult if something online makes you uncomfortable. Take time to learn about privacy, respectful communication, and staying safe online. You can review and change privacy settings later."}</AIText></ScrollView>{warning === "child" ? <View style={styles.modalButtons}><Pressable onPress={() => void discontinueUnderageFlow()} style={styles.primaryModalButton}><Text style={styles.primaryModalText}>OK</Text></Pressable></View> : <View style={styles.modalButtons}><Pressable onPress={() => setWarningRead((value) => !value)} style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked: warningRead }}><View style={[styles.checkbox, warningRead && styles.checkboxChecked]}>{warningRead ? <CheckWhite width={18} height={18} /> : null}</View><Text style={styles.checkText}><AIText context="ReDom teen safety acknowledgement">I understand the safety reminder.</AIText></Text></Pressable><Pressable disabled={!warningRead || !savedFlow} onPress={() => { if (!savedFlow) return; setWarning(null); navigation.replace("RegistrationGender", savedFlow); }} style={[styles.primaryModalButton, (!warningRead || !savedFlow) && styles.modalDisabled]}><Text style={styles.primaryModalText}>I understand &amp; continue</Text></Pressable><Pressable onPress={() => { setWarning(null); navigation.navigate("Login"); }} style={styles.secondaryModalButton}><Text style={styles.secondaryModalText}>{t("login")}</Text></Pressable></View>}</View></View></Modal></ReDomScreen>;
}

const styles = StyleSheet.create({
  content:{flex:1,width:"100%",maxWidth:520,alignSelf:"center",justifyContent:"flex-start",paddingTop:4,paddingBottom:24},
  backButton:{width:42,height:42,justifyContent:"center",alignItems:"flex-start",marginBottom:24},
  backArrow:{fontSize:43,lineHeight:44,fontWeight:"300",color:"#111111",marginTop:-4},
  headingBlock:{marginBottom:25},
  title:{color:"#111111",fontSize:30,lineHeight:37,fontWeight:"800",textAlign:"left",letterSpacing:-0.7,marginBottom:9},
  description:{color:TEXT,fontSize:17,lineHeight:25,textAlign:"left"},
  helper:{color:MUTED,fontSize:14,lineHeight:21,textAlign:"left",marginTop:7,marginBottom:0},
  spinnerBox:{height:190,width:"100%",borderWidth:1,borderColor:"#DADDE1",borderRadius:20,flexDirection:"row",overflow:"hidden",backgroundColor:"#FFFFFF"},
  lockedBox:{opacity:.6},
  wheelWrap:{flex:1,height:190,position:"relative",borderRightWidth:1,borderRightColor:"#E4E6E9"},
  wheelLabel:{position:"absolute",top:8,left:0,right:0,zIndex:2,fontSize:11,fontWeight:"800",color:BLUE,textAlign:"center",letterSpacing:.4},
  wheelViewport:{position:"absolute",top:30,left:0,right:0,bottom:0},
  wheelContent:{paddingVertical:43},
  wheelItem:{alignItems:"center",justifyContent:"center"},
  wheelText:{fontSize:17,lineHeight:23,color:MUTED},
  wheelTextSelected:{fontSize:21,lineHeight:27,color:TEXT,fontWeight:"800"},
  wheelSelection:{position:"absolute",left:6,right:6,top:78,height:50,borderWidth:1.6,borderColor:BLUE,borderRadius:13,backgroundColor:"rgba(24,119,242,0.035)"},
  error:{color:"#E41E3F",fontSize:13,lineHeight:19,fontWeight:"600",marginTop:12,textAlign:"center"},
  button:{height:58,borderRadius:30,backgroundColor:BLUE,alignItems:"center",justifyContent:"center",marginTop:23,width:"100%",shadowColor:BLUE,shadowOpacity:.14,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:2},
  buttonText:{color:"#FFFFFF",fontSize:17,fontWeight:"700",letterSpacing:.1},
  disabled:{opacity:.7},
  progress:{flexDirection:"row",justifyContent:"center",gap:8,marginTop:24},
  dot:{width:8,height:8,borderRadius:4,backgroundColor:"#D8DCE1"},
  dotActive:{width:24,backgroundColor:BLUE},
  footerContent:{width:"100%",alignItems:"stretch",gap:16},
  loginRow:{flexDirection:"row",justifyContent:"center",alignItems:"center",paddingBottom:1},
  muted:{color:MUTED,fontSize:14},
  link:{color:"#2167B2",fontSize:14,fontWeight:"700"},
  footerBottom:{width:"100%",flexDirection:"row",alignItems:"center",justifyContent:"space-between",minHeight:22},
  flowMeta:{alignItems:"flex-end",flexShrink:1,maxWidth:"68%"},
  flowMetaText:{color:"#A0A4AA",fontSize:8,lineHeight:10,letterSpacing:.1},
  flowExpiry:{color:"#A0A4AA",fontSize:8,lineHeight:10},
  modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,.38)",justifyContent:"flex-start",paddingHorizontal:20,paddingTop:70},
  modalCard:{maxHeight:"82%",width:"100%",backgroundColor:"#FFFFFF",borderRadius:22,padding:24,alignItems:"center",shadowOpacity:.2,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:8},
  modalTitle:{color:TEXT,fontSize:21,lineHeight:27,fontWeight:"800",textAlign:"center",marginTop:12,marginBottom:12},
  warningScroll:{width:"100%",maxHeight:280},
  warningContent:{paddingBottom:18},
  modalBody:{color:MUTED,fontSize:15,lineHeight:23,textAlign:"left"},
  modalButtons:{width:"100%",gap:10},
  checkRow:{minHeight:48,flexDirection:"row",alignItems:"center",gap:10},
  checkbox:{width:24,height:24,borderRadius:6,borderWidth:1.5,borderColor:BORDER,alignItems:"center",justifyContent:"center",backgroundColor:"#FFFFFF"},
  checkboxChecked:{backgroundColor:BLUE,borderColor:BLUE},
  checkText:{flex:1,color:TEXT,fontSize:14,lineHeight:20},
  primaryModalButton:{height:50,borderRadius:13,backgroundColor:BLUE,alignItems:"center",justifyContent:"center"},
  primaryModalText:{color:"#FFFFFF",fontSize:16,fontWeight:"800"},
  secondaryModalButton:{height:50,borderRadius:13,borderWidth:2,borderColor:BLUE,alignItems:"center",justifyContent:"center"},
  secondaryModalText:{color:BLUE,fontSize:16,fontWeight:"800"},
  modalDisabled:{opacity:.45}
});
