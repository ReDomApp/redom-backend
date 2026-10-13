import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../../assets/brand/redom-logo.svg";
import { ReDomScreen } from "../../layout/ReDomScreen";
import { authService } from "../../auth/service";
import { getDeviceId } from "../../utils/device";
import { useLanguage } from "../../i18n/LanguageProvider";
import type { RootStackParamList } from "../../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationIdentity">;
const BLUE = "#1877F2"; const TEXT = "#1C1E21"; const MUTED = "#65676B"; const BORDER = "#DADDE1";
const NAME_PATTERN = /^[\p{L}][\p{L}\s.,'-]*$/u;
const JUNK_NAMES = new Set(["test", "testing", "asdf", "qwerty", "admin", "name", "firstname", "lastname", "unknown", "none", "null"]);
function sanitizeName(value: string) { return value.normalize("NFC").replace(/[^\p{L}\s.,'-]/gu, "").replace(/\s+/g, " "); }
function validateName(value: string, label: string, uiMessage: (key: string, vars?: Record<string, string>) => string) {
  const name = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (name.length < 3) return uiMessage("nameMin", { name: label });
  if (!NAME_PATTERN.test(name)) return uiMessage("nameUnsupported", { name: label });
  if (!/\p{L}/u.test(name)) return uiMessage("nameLetters", { name: label });
  if (/^[.,'-]|[.,'-]$/.test(name) || /[.,'-]{2,}/.test(name)) return uiMessage("namePunctuation", { name: label });
  if (JUNK_NAMES.has(name.toLocaleLowerCase())) return uiMessage("nameReal", { name: name.toLocaleLowerCase() });
  return null;
}
function maskedFlowId(flowId: string) { const visible = flowId.slice(0, 4); return `${visible}${"•".repeat(Math.max(0, flowId.length - visible.length))}√`; }

export function RegistrationIdentityScreen({ navigation, route }: Props) {
  const { t, uiMessage } = useLanguage(); const { reservationId, flowId, expiresAt } = route.params;
  const [firstName, setFirstName] = useState(""); const [lastName, setLastName] = useState(""); const lastNameInput = useRef<TextInput>(null); const [focused, setFocused] = useState<"first" | "last" | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const remainingMinutes = useMemo(() => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000)), [expiresAt]);
  async function continueRegistration() {
    if (loading) return;
    const firstError = validateName(firstName, t("firstName"), uiMessage); const lastError = validateName(lastName, t("lastName"), uiMessage);
    if (firstError || lastError) { setError(firstError ?? lastError); return; }
    setLoading(true); setError(null);
    try {
      await authService.saveRegistrationFlowName({ reservationId, flowId, deviceId: await getDeviceId(), firstName: firstName.trim().replace(/\s+/g, " "), lastName: lastName.trim().replace(/\s+/g, " ") });
      navigation.replace("RegistrationBirthday", { reservationId, flowId, expiresAt });
    } catch (e) { setError(e instanceof Error ? e.message : uiMessage("nameSaveFailed")); }
    finally { setLoading(false); }
  }
  const footer = <View style={styles.footerContent}>
    <View style={styles.loginRow}><Text style={styles.muted}>{t("alreadyAccount")} </Text><Pressable accessibilityRole="link" onPress={() => navigation.navigate("Login")} disabled={loading} hitSlop={8}><Text style={styles.link}>{t("login")}</Text></Pressable></View>
    <View style={styles.footerBottom}><ReDomLogo width={66} height={19} /><View style={styles.flowMeta}><Text numberOfLines={1} style={styles.flowMetaText}>Flow ID: {maskedFlowId(flowId)}</Text><Text style={styles.flowExpiry}>{remainingMinutes} min left</Text></View></View>
  </View>;
  return <ReDomScreen footer={footer} backgroundColor="#FFFFFF"><View style={styles.content}>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={10}><Text style={styles.backArrow}>‹</Text></Pressable>
    <View style={styles.headingBlock}><Text style={styles.title}>{t("whatsName")}</Text><Text style={styles.description}>{t("realName")}</Text></View>
    <View style={styles.nameRow}>
      <View style={styles.fieldWrap}><TextInput value={firstName} onChangeText={(v) => { setFirstName(sanitizeName(v)); setError(null); }} onFocus={() => setFocused("first")} onBlur={() => setFocused(null)} style={[styles.input, focused === "first" && styles.inputFocused, error && styles.inputError]} placeholder={t("firstName")} placeholderTextColor={MUTED} textContentType="givenName" autoComplete="name-given" autoCapitalize="words" autoCorrect={false} spellCheck={false} keyboardType={Platform.OS === "ios" ? "ascii-capable" : "visible-password"} returnKeyType="next" onSubmitEditing={() => lastNameInput.current?.focus()} editable={!loading} maxLength={100} accessibilityLabel={t("firstName")} /></View>
      <View style={styles.fieldWrap}><TextInput ref={lastNameInput} value={lastName} onChangeText={(v) => { setLastName(sanitizeName(v)); setError(null); }} onFocus={() => setFocused("last")} onBlur={() => setFocused(null)} style={[styles.input, focused === "last" && styles.inputFocused, error && styles.inputError]} placeholder={t("lastName")} placeholderTextColor={MUTED} textContentType="familyName" autoComplete="name-family" autoCapitalize="words" autoCorrect={false} spellCheck={false} keyboardType={Platform.OS === "ios" ? "ascii-capable" : "visible-password"} returnKeyType="done" onSubmitEditing={() => void continueRegistration()} editable={!loading} maxLength={100} accessibilityLabel={t("lastName")} /></View>
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" onPress={() => void continueRegistration()} disabled={loading} style={({ pressed }) => [styles.button, loading && styles.disabled, pressed && !loading && styles.buttonPressed]}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{t("continue")}</Text>}</Pressable>
    <Text style={styles.privacyHint}>Use the name people know you by in everyday life.</Text>
  </View></ReDomScreen>;
}
const styles = StyleSheet.create({
  content:{flex:1,width:"100%",maxWidth:520,alignSelf:"center",paddingTop:8,paddingBottom:28},
  backButton:{width:42,height:42,justifyContent:"center",alignItems:"flex-start",marginBottom:25},
  backArrow:{fontSize:43,lineHeight:44,fontWeight:"300",color:"#111111",marginTop:-4},
  headingBlock:{marginBottom:28},
  title:{color:"#111111",fontSize:30,lineHeight:37,fontWeight:"800",letterSpacing:-0.7,marginBottom:9},
  description:{color:TEXT,fontSize:17,lineHeight:25,fontWeight:"400"},
  nameRow:{flexDirection:"row",gap:12,width:"100%"},
  fieldWrap:{flex:1,minWidth:0},
  input:{height:66,borderWidth:1.3,borderColor:"#E0E0E0",borderRadius:19,paddingHorizontal:16,color:TEXT,fontSize:16,backgroundColor:"#FFFFFF"},
  inputFocused:{borderColor:BLUE,borderWidth:1.7},
  inputError:{borderColor:"#C43D58"},
  error:{color:"#B4233B",fontSize:13.5,lineHeight:20,fontWeight:"500",marginTop:12},
  button:{height:58,borderRadius:30,backgroundColor:BLUE,alignItems:"center",justifyContent:"center",marginTop:24,width:"100%",shadowColor:BLUE,shadowOpacity:0.14,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:2},
  buttonText:{color:"#FFFFFF",fontSize:17,fontWeight:"700",letterSpacing:0.1},
  buttonPressed:{opacity:0.86,transform:[{scale:0.995}]},
  disabled:{opacity:0.7},
  privacyHint:{color:"#73777D",fontSize:12.5,lineHeight:18,marginTop:12},
  footerContent:{width:"100%",alignItems:"stretch",gap:16},
  loginRow:{flexDirection:"row",justifyContent:"center",alignItems:"center",paddingBottom:1},
  muted:{color:MUTED,fontSize:14},
  link:{color:"#2167B2",fontSize:14,fontWeight:"700"},
  footerBottom:{width:"100%",flexDirection:"row",alignItems:"center",justifyContent:"space-between",minHeight:22},
  flowMeta:{alignItems:"flex-end",flexShrink:1,maxWidth:"68%"},
  flowMetaText:{color:"#A0A4AA",fontSize:8,lineHeight:10,letterSpacing:0.1},
  flowExpiry:{color:"#A0A4AA",fontSize:8,lineHeight:10}
});