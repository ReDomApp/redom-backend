import { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../../assets/brand/redom-logo.svg";
import LockedKey from "../../assets/auth/locked-key.svg";
import { ReDomScreen } from "../../layout/ReDomScreen";
import { authService } from "../../auth/service";
import { getDeviceId } from "../../utils/device";
import { useLanguage } from "../../i18n/LanguageProvider";
import type { RootStackParamList } from "../../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationIdentity">;
const BLUE = "#1877F2"; const TEXT = "#1C1E21"; const MUTED = "#65676B"; const BORDER = "#CCD0D5";
const NAME_PATTERN = /^[\p{L}][\p{L}\s.,'-]*$/u;
const JUNK_NAMES = new Set(["test", "testing", "asdf", "qwerty", "admin", "name", "firstname", "lastname", "unknown", "none", "null"]);
function sanitizeName(value: string) { return value.normalize("NFC").replace(/[^\p{L}\s.,'-]/gu, "").replace(/\s+/g, " "); }
function validateName(value: string, label: string, uiMessage: (key: string, vars?: Record<string, string>) => string) {
  const name = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (name.length < 3) return uiMessage("nameMin", { name: label });
  if (!NAME_PATTERN.test(name)) return uiMessage("nameUnsupported", { name: label });
  if (!/\p{L}/u.test(name)) return uiMessage("nameLetters", { name: label });
  if (/^[.,'-]|[.,'-]$/.test(name) || /[.,'-]{2,}/.test(name)) return uiMessage("namePunctuation", { name: label });
  if (JUNK_NAMES.has(name.toLocaleLowerCase())) return uiMessage("nameReal", { name: label.toLocaleLowerCase() });
  return null;
}
function maskedFlowId(flowId: string) { const visible = flowId.slice(0, 4); return `${visible}${"•".repeat(Math.max(0, flowId.length - visible.length))}√`; }

export function RegistrationIdentityScreen({ navigation, route }: Props) {
  const { t, uiMessage } = useLanguage(); const { reservationId, flowId, expiresAt } = route.params;
  const [firstName, setFirstName] = useState(""); const [lastName, setLastName] = useState(""); const [focused, setFocused] = useState<"first" | "last" | null>(null); const [error, setError] = useState<string | null>(null); const [saved, setSaved] = useState(false); const [loading, setLoading] = useState(false);
  const remainingMinutes = useMemo(() => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000)), [expiresAt]);
  async function continueRegistration() {
    if (loading) return;
    const firstError = validateName(firstName, t("firstName"), uiMessage); const lastError = validateName(lastName, t("lastName"), uiMessage);
    if (firstError || lastError) { setError(firstError ?? lastError); return; }
    setLoading(true); setError(null); setSaved(false);
    try { await authService.saveRegistrationFlowName({ reservationId, flowId, deviceId: await getDeviceId(), firstName: firstName.trim().replace(/\s+/g, " "), lastName: lastName.trim().replace(/\s+/g, " ") }); setSaved(true); }
    catch (e) { setError(e instanceof Error ? e.message : uiMessage("nameSaveFailed")); }
    finally { setLoading(false); }
  }
  const footer = <View style={styles.footerContent}><View style={styles.loginRow}><Text style={styles.muted}>{t("alreadyAccount")} </Text><Pressable onPress={() => navigation.navigate("Login")} disabled={loading}><Text style={styles.link}>{t("login")}</Text></Pressable></View><View style={styles.companyRow}><ReDomLogo width={72} height={20} /><Text style={styles.company}>{t("company")}</Text></View></View>;
  return <ReDomScreen footer={footer}><View style={styles.content}>
    <View style={styles.logo}><ReDomLogo width={150} height={42} /></View>
    <View style={styles.flowHeader}><View style={styles.flowRow}><LockedKey width={20} height={20} /><Text style={styles.flowText}>{t("flowId", { flowId: maskedFlowId(flowId) })}</Text></View><Text style={styles.expiry}>{remainingMinutes} min</Text></View>
    <Text style={styles.title}>{t("whatsName")}</Text><Text style={styles.description}>{t("realName")}</Text><Text style={styles.helper}>{t("everydayName")}</Text>
    <View style={styles.nameRow}>
      <View style={styles.fieldWrap}><TextInput value={firstName} onChangeText={(v) => { setFirstName(sanitizeName(v)); setError(null); setSaved(false); }} onFocus={() => setFocused("first")} onBlur={() => setFocused(null)} style={[styles.input, focused === "first" && styles.inputFocused]} textContentType="givenName" autoComplete="name-given" autoCapitalize="words" autoCorrect={false} spellCheck={false} keyboardType={Platform.OS === "ios" ? "ascii-capable" : "visible-password"} editable={!loading} maxLength={100} accessibilityLabel={t("firstName")} /><Text style={[styles.floatingLabel, (focused === "first" || firstName.length > 0) && styles.floatingLabelActive]}>{t("firstName")}</Text></View>
      <View style={styles.fieldWrap}><TextInput value={lastName} onChangeText={(v) => { setLastName(sanitizeName(v)); setError(null); setSaved(false); }} onFocus={() => setFocused("last")} onBlur={() => setFocused(null)} style={[styles.input, focused === "last" && styles.inputFocused]} textContentType="familyName" autoComplete="name-family" autoCapitalize="words" autoCorrect={false} spellCheck={false} keyboardType={Platform.OS === "ios" ? "ascii-capable" : "visible-password"} editable={!loading} maxLength={100} accessibilityLabel={t("lastName")} /><Text style={[styles.floatingLabel, (focused === "last" || lastName.length > 0) && styles.floatingLabelActive]}>{t("lastName")}</Text></View>
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}{saved ? <Text style={styles.saved}>{uiMessage("nameSaved")}</Text> : null}
    <Pressable accessibilityRole="button" onPress={() => void continueRegistration()} disabled={loading} style={[styles.button, loading && styles.disabled]}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{t("continue")}</Text>}</Pressable>
    <View style={styles.progress} accessibilityLabel={uiMessage("progress2")}>{[0,1,2,3,4,5].map((step) => <View key={step} style={[styles.dot, step <= 1 && styles.dotActive]} />)}</View>
  </View></ReDomScreen>;
}
const styles = StyleSheet.create({ content:{flex:1,width:"100%",justifyContent:"center",paddingVertical:8},logo:{alignItems:"center",marginBottom:16},flowHeader:{marginBottom:24},flowRow:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7},flowText:{color:BLUE,fontSize:13,fontWeight:"800",letterSpacing:.3},expiry:{color:MUTED,fontSize:11.5,textAlign:"center",marginTop:6},title:{color:TEXT,fontSize:27,lineHeight:33,fontWeight:"800",textAlign:"center",marginBottom:8},description:{color:TEXT,fontSize:15,lineHeight:22,textAlign:"center"},helper:{color:MUTED,fontSize:13,lineHeight:19,textAlign:"center",marginTop:5,marginBottom:25},nameRow:{flexDirection:"row",gap:10,width:"100%"},fieldWrap:{flex:1,position:"relative",minWidth:0},input:{height:58,borderWidth:1,borderColor:BORDER,borderRadius:12,paddingHorizontal:14,paddingTop:7,color:TEXT,fontSize:16,backgroundColor:"#FFFFFF"},inputFocused:{borderColor:BLUE,borderWidth:1.5},floatingLabel:{position:"absolute",left:11,top:19,paddingHorizontal:4,color:MUTED,fontSize:15,backgroundColor:"#FFFFFF"},floatingLabelActive:{top:-8,color:BLUE,fontSize:11.5,fontWeight:"700"},error:{color:"#E41E3F",fontSize:13,lineHeight:19,fontWeight:"600",marginTop:12,textAlign:"center"},saved:{color:"#18794E",fontSize:13,lineHeight:19,fontWeight:"600",marginTop:12,textAlign:"center"},button:{height:54,borderRadius:13,backgroundColor:BLUE,alignItems:"center",justifyContent:"center",marginTop:20,width:"100%"},buttonText:{color:"#FFFFFF",fontSize:17,fontWeight:"800"},disabled:{opacity:.7},progress:{flexDirection:"row",justifyContent:"center",gap:8,marginTop:27},dot:{width:8,height:8,borderRadius:4,backgroundColor:"#D8DCE1"},dotActive:{width:24,backgroundColor:BLUE},footerContent:{width:"100%",alignItems:"center"},loginRow:{flexDirection:"row",justifyContent:"center",alignItems:"center"},muted:{color:MUTED,fontSize:14},link:{color:BLUE,fontSize:14,fontWeight:"800"},companyRow:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,marginTop:9},company:{color:MUTED,fontSize:12}});
