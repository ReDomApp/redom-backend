import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../../assets/brand/redom-logo.svg";
import LockedKey from "../../assets/auth/locked-key.svg";
import PrimarySecurity from "../../assets/auth/primary-security.svg";
import SecurityShield from "../../assets/auth/security-shield.svg";
import { ReDomScreen } from "../../layout/ReDomScreen";
import { AIText } from "../../i18n/AIText";
import { useLanguage } from "../../i18n/LanguageProvider";
import { authService } from "../../auth/service";
import { getDeviceId } from "../../utils/device";
import type { RootStackParamList } from "../../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationBirthday">;
const BLUE = "#1877F2";
const TEXT = "#1C1E21";
const MUTED = "#65676B";
const BORDER = "#CCD0D5";

function maskedFlowId(flowId: string) {
  const visible = flowId.slice(0, 4);
  return `${visible}${"•".repeat(Math.max(0, flowId.length - visible.length))}√`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function WheelColumn({ values, selected, onChange, label, disabled }: { values: number[]; selected: number; onChange: (value: number) => void; label: string; disabled: boolean }) {
  const selectedIndex = Math.max(0, values.indexOf(selected));
  const ITEM_HEIGHT = 50;
  return (
    <View style={styles.wheelWrap}>
      <Text style={styles.wheelLabel}>{label}</Text>
      <ScrollView
        style={styles.wheelViewport}
        scrollEnabled={!disabled}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={styles.wheelContent}
        onMomentumScrollEnd={(event) => {
          const index = Math.max(0, Math.min(values.length - 1, Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT)));
          onChange(values[index]!);
        }}
        contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
      >
        {values.map((value) => (
          <View key={value} style={[styles.wheelItem, { height: ITEM_HEIGHT }]}>
            <Text style={[styles.wheelText, value === selected && styles.wheelTextSelected]}>{String(value).padStart(2, "0")}</Text>
          </View>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={styles.wheelSelection} />
    </View>
  );
}

export function RegistrationBirthdayScreen({ navigation, route }: Props) {
  const { t, uiMessage } = useLanguage();
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

  useEffect(() => {
    const update = () => setSecondsLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const dateOfBirth = useMemo(() => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, [year, month, day]);
  const years = useMemo(() => Array.from({ length: 99 }, (_, index) => 2018 - index), []);
  const days = useMemo(() => Array.from({ length: daysInMonth(year, month) }, (_, index) => index + 1), [year, month]);
  const countdown = `${Math.floor(secondsLeft / 60).toString().padStart(2, "0")}:${(secondsLeft % 60).toString().padStart(2, "0")}`;

  useEffect(() => {
    const maxDay = daysInMonth(year, month);
    if (day > maxDay) setDay(maxDay);
  }, [year, month, day]);

  async function continueRegistration() {
    if (loading || flowLocked || secondsLeft <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await authService.saveRegistrationFlowBirthday({ reservationId, flowId, deviceId: await getDeviceId(), dateOfBirth });
      if (result.ageBand === "underage") {
        setFlowLocked(true);
        setWarning("child");
        setWarningRead(false);
      } else if (result.ageBand === "teen") {
        setWarning("teen");
        setWarningRead(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : uiMessage("loginFailed"));
    } finally {
      setLoading(false);
    }
  }

  const footer = (
    <View style={styles.footerContent}>
      <View style={styles.loginRow}>
        <Text style={styles.muted}>{t("alreadyAccount")} </Text>
        <Pressable onPress={() => navigation.navigate("Login")} disabled={loading}>
          <Text style={styles.link}>{t("login")}</Text>
        </Pressable>
      </View>
      <View style={styles.companyRow}><ReDomLogo width={72} height={20} /><Text style={styles.company}>{t("company")}</Text></View>
    </View>
  );

  return (
    <ReDomScreen footer={footer}>
      <View style={styles.content}>
        <View style={styles.logo}><ReDomLogo width={150} height={42} /></View>
        <View style={styles.flowHeader}>
          <View style={styles.flowRow}><LockedKey width={20} height={20} /><Text style={styles.flowText}>{t("flowId", { flowId: maskedFlowId(flowId) })}</Text></View>
          <Text style={styles.expiry}>{countdown}</Text>
        </View>
        <Text style={styles.title}><AIText context="ReDom signup birthday title">What's your birthday?</AIText></Text>
        <Text style={styles.description}><AIText context="ReDom signup birthday description">Choose your date of birth. It must be the birthday you use in everyday life.</AIText></Text>
        <Text style={styles.helper}><AIText context="ReDom signup birthday privacy helper">You can always make this private later.</AIText></Text>
        <View style={[styles.spinnerBox, flowLocked && styles.lockedBox]}>
          <WheelColumn label="YYYY" values={years} selected={year} onChange={setYear} disabled={flowLocked} />
          <WheelColumn label="MM" values={Array.from({ length: 12 }, (_, index) => index + 1)} selected={month} onChange={setMonth} disabled={flowLocked} />
          <WheelColumn label="DD" values={days} selected={day} onChange={setDay} disabled={flowLocked} />
        </View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => void continueRegistration()} disabled={loading || flowLocked || secondsLeft <= 0} style={[styles.button, (loading || flowLocked || secondsLeft <= 0) && styles.disabled]}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{t("continue")}</Text>}
        </Pressable>
        <View style={styles.progress} accessibilityLabel={uiMessage("progress3")}>
          {[0, 1, 2, 3, 4, 5].map((step) => <View key={step} style={[styles.dot, step <= 2 && styles.dotActive]} />)}
        </View>
      </View>

      <Modal visible={warning !== null} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {warning === "child" ? <SecurityShield width={64} height={64} /> : <PrimarySecurity width={64} height={64} />}
            <Text style={styles.modalTitle}>
              {warning === "child" ? <AIText context="ReDom child account safety">We can't continue with this account.</AIText> : <AIText context="ReDom teen account safety">A safety reminder before you continue</AIText>}
            </Text>
            <ScrollView
              style={styles.warningScroll}
              contentContainerStyle={styles.warningContent}
              showsVerticalScrollIndicator
              onScroll={(event) => {
                const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
                if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 24) setWarningRead(true);
              }}
              scrollEventThrottle={16}
            >
              {warning === "child" ? (
                <AIText context="ReDom underage protection message" style={styles.modalBody}>
                  ReDom is designed for people who meet our minimum age requirements. For your safety, this registration flow has been stopped because the birthday entered indicates that the person is under 13. Your Flow ID has been completed and cannot continue.
                </AIText>
              ) : (
                <AIText context="ReDom teen safety message" style={styles.modalBody}>
                  Because you are 13–16, we want you to use ReDom with extra care. Protect your password, avoid sharing private information with people you do not know, and tell a parent, guardian, teacher, or another trusted adult if something online makes you uncomfortable. Take time to learn about privacy, respectful communication, and staying safe online. You can review and change privacy settings later.
                </AIText>
              )}
            </ScrollView>
            {warning === "child" ? (
              <View style={styles.modalButtons}>
                <Pressable onPress={() => setWarning(null)} style={styles.primaryModalButton}><Text style={styles.primaryModalText}>OK</Text></Pressable>
                <Pressable onPress={() => { setWarning(null); navigation.navigate("Login"); }} style={styles.secondaryModalButton}><Text style={styles.secondaryModalText}>{t("login")}</Text></Pressable>
              </View>
            ) : (
              <View style={styles.modalButtons}>
                <Pressable disabled={!warningRead} onPress={() => setWarning(null)} style={[styles.primaryModalButton, !warningRead && styles.modalDisabled]}><Text style={styles.primaryModalText}>I understand &amp; continue</Text></Pressable>
                <Pressable onPress={() => { setWarning(null); navigation.navigate("Login"); }} style={styles.secondaryModalButton}><Text style={styles.secondaryModalText}>{t("login")}</Text></Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ReDomScreen>
  );
}

const styles = StyleSheet.create({
  content:{flex:1,width:"100%",justifyContent:"flex-start",paddingTop:44,paddingBottom:8},
  logo:{alignItems:"center",marginBottom:16},
  flowHeader:{marginBottom:24},
  flowRow:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7},
  flowText:{color:BLUE,fontSize:13,fontWeight:"800",letterSpacing:.3},
  expiry:{color:MUTED,fontSize:13,textAlign:"center",marginTop:6,fontVariant:["tabular-nums"]},
  title:{color:TEXT,fontSize:27,lineHeight:33,fontWeight:"800",textAlign:"center",marginBottom:8},
  description:{color:TEXT,fontSize:15,lineHeight:22,textAlign:"center"},
  helper:{color:MUTED,fontSize:13,lineHeight:19,textAlign:"center",marginTop:5,marginBottom:22},
  spinnerBox:{height:170,width:"100%",borderWidth:1,borderColor:BORDER,borderRadius:14,flexDirection:"row",overflow:"hidden",backgroundColor:"#FFFFFF"},
  lockedBox:{opacity:.6},
  wheelWrap:{flex:1,height:170,position:"relative",borderRightWidth:1,borderRightColor:"#E4E6E9"},
  wheelLabel:{position:"absolute",top:6,left:0,right:0,zIndex:2,fontSize:10.5,fontWeight:"800",color:BLUE,textAlign:"center"},
  wheelViewport:{position:"absolute",top:28,left:0,right:0,bottom:0},
  wheelContent:{paddingVertical:43},
  wheelItem:{alignItems:"center",justifyContent:"center"},
  wheelText:{fontSize:16,lineHeight:22,color:MUTED},
  wheelTextSelected:{fontSize:20,lineHeight:25,color:TEXT,fontWeight:"800"},
  wheelSelection:{position:"absolute",left:5,right:5,top:71,height:50,borderWidth:1.5,borderColor:BLUE,borderRadius:10},
  error:{color:"#E41E3F",fontSize:13,lineHeight:19,fontWeight:"600",marginTop:12,textAlign:"center"},
  button:{height:54,borderRadius:13,backgroundColor:BLUE,alignItems:"center",justifyContent:"center",marginTop:20,width:"100%"},
  buttonText:{color:"#FFFFFF",fontSize:17,fontWeight:"800"},
  disabled:{opacity:.7},
  progress:{flexDirection:"row",justifyContent:"center",gap:8,marginTop:27},
  dot:{width:8,height:8,borderRadius:4,backgroundColor:"#D8DCE1"},
  dotActive:{width:24,backgroundColor:BLUE},
  footerContent:{width:"100%",alignItems:"center"},
  loginRow:{flexDirection:"row",justifyContent:"center",alignItems:"center"},
  muted:{color:MUTED,fontSize:14},
  link:{color:BLUE,fontSize:14,fontWeight:"800"},
  companyRow:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,marginTop:9},
  company:{color:MUTED,fontSize:12},
  modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,.38)",justifyContent:"flex-start",paddingHorizontal:20,paddingTop:70},
  modalCard:{maxHeight:"82%",width:"100%",backgroundColor:"#FFFFFF",borderRadius:22,padding:24,alignItems:"center",shadowOpacity:.2,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:8},
  modalTitle:{color:TEXT,fontSize:21,lineHeight:27,fontWeight:"800",textAlign:"center",marginTop:12,marginBottom:12},
  warningScroll:{width:"100%",maxHeight:280},
  warningContent:{paddingBottom:18},
  modalBody:{color:MUTED,fontSize:15,lineHeight:23,textAlign:"left"},
  modalButtons:{width:"100%",gap:10},
  primaryModalButton:{height:50,borderRadius:13,backgroundColor:BLUE,alignItems:"center",justifyContent:"center"},
  primaryModalText:{color:"#FFFFFF",fontSize:16,fontWeight:"800"},
  secondaryModalButton:{height:50,borderRadius:13,borderWidth:2,borderColor:BLUE,alignItems:"center",justifyContent:"center"},
  secondaryModalText:{color:BLUE,fontSize:16,fontWeight:"800"},
  modalDisabled:{opacity:.45},
});