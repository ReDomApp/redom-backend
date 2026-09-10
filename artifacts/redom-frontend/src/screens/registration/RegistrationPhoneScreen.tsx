import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getLocales } from "expo-localization";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../../assets/brand/redom-logo.svg";
import LockedKey from "../../assets/auth/locked-key.svg";
import SecurityShield from "../../assets/auth/security-shield.svg";
import InfoBlack from "../../assets/auth/info-black.svg";
import CheckWhite from "../../assets/auth/check-white.svg";
import SearchIcon from "../../assets/auth/search.svg";
import { ReDomScreen } from "../../layout/ReDomScreen";
import { AIText } from "../../i18n/AIText";
import { useLanguage } from "../../i18n/LanguageProvider";
import { authService } from "../../auth/service";
import { detectPublicIp } from "../../auth/publicIp";
import { getDeviceId } from "../../utils/device";
import { COUNTRIES, type Country } from "../../data/countries";
import type { RegistrationFlowNetworkSecurity } from "../../auth/types";
import type { RootStackParamList } from "../../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationPhone">;
const BLUE = "#1877F2"; const TEXT = "#1C1E21"; const MUTED = "#65676B"; const BORDER = "#CCD0D5"; const ERROR = "#E41E3F";
const maskIp = (ip: string | null) => !ip ? "Unavailable" : ip.includes(":") ? `${ip.slice(0, 8)}••••••` : `${ip.split(".").slice(0, 2).join(".")}.•••••`;
const digits = (v: string) => v.replace(/\D/g, "");
const dial = (c: Country) => digits(c.dialCode);
const flowMask = (v: string) => `${v.slice(0, 4)}${"•".repeat(Math.max(0, v.length - 4))}√`;
const pretty = (v: unknown) => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } };

export function RegistrationPhoneScreen({ navigation, route }: Props) {
  const { t } = useLanguage();
  const { reservationId, flowId, expiresAt } = route.params;
  const [country, setCountry] = useState<Country>(COUNTRIES.find((c) => c.code === "NG") ?? COUNTRIES[0]!);
  const [phone, setPhone] = useState(""); const [countryOpen, setCountryOpen] = useState(false); const [countrySearch, setCountrySearch] = useState("");
  const [securityOpen, setSecurityOpen] = useState(false); const [consent, setConsent] = useState(false);
  const [checking, setChecking] = useState(false); const [stage, setStage] = useState<"phone" | "security" | "saving">("phone");
  const [security, setSecurity] = useState<RegistrationFlowNetworkSecurity | null>(null); const [publicIp, setPublicIp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null); const [saved, setSaved] = useState(false); const [deviceId, setDeviceId] = useState<string>();
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));

  useEffect(() => { const id = setInterval(() => setSeconds(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))), 1000); return () => clearInterval(id); }, [expiresAt]);
  useEffect(() => { let active = true; void (async () => { try { const id = await getDeviceId(); if (!active) return; setDeviceId(id); const ip = await detectPublicIp(); if (active) setPublicIp(ip); const locale = getLocales()[0]; const result = await authService.detectRegistrationFlowPhoneCountry({ reservationId, flowId, deviceId: id, deviceRegion: locale?.regionCode?.toUpperCase(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, ip }); if (active && result.countryCode) { const detected = COUNTRIES.find((c) => c.code === result.countryCode); if (detected) setCountry(detected); } } catch { /* device country remains the safe fallback */ } })(); return () => { active = false; }; }, [flowId, reservationId]);

  const filteredCountries = useMemo(() => { const q = countrySearch.trim().toLowerCase(); if (!q) return COUNTRIES; const n = q.replace(/\s+/g, ""); return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === n.toUpperCase() || digits(c.dialCode).includes(n)); }, [countrySearch]);
  const canContinue = digits(phone).length >= 5 && seconds > 0 && !checking && !saved;
  const countdown = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  function buildPhone() { const raw = phone.trim(); const value = digits(raw); const prefix = dial(country); if (!value) throw new Error("Please enter your mobile number."); if (raw.startsWith("+") && !value.startsWith(prefix)) throw new Error("The phone number country code does not match the selected country."); const national = (raw.startsWith("+") ? value.slice(prefix.length) : value).replace(/^0+/, ""); if (national.length < 5) throw new Error("Please enter a valid mobile number."); return `+${prefix}${national}`; }

  async function inspect() {
    if (!canContinue) return;
    setChecking(true); setStage("phone"); setError(null);
    try {
      const ip = publicIp || await detectPublicIp(); setPublicIp(ip);
      const locale = getLocales()[0]; const phoneNumber = buildPhone();
      await authService.saveRegistrationFlowPhone({ reservationId, flowId, deviceId, phoneNumber, countryCode: country.code, deviceRegion: locale?.regionCode?.toUpperCase(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, ip });
      setStage("security");
      const result = await authService.inspectRegistrationFlowSecurity({ reservationId, flowId, deviceId, ip });
      setSecurity(result.security); setConsent(false); setSaved(true); setSecurityOpen(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to complete the registration security check."); setSaved(false); }
    finally { setChecking(false); }
  }

  async function acceptSecurity() {
    if (!security || !consent || !publicIp || checking) return;
    setChecking(true); setStage("saving"); setError(null);
    try {
      await authService.consentRegistrationFlowSecurity({ reservationId, flowId, deviceId, ip: publicIp });
      setSecurityOpen(false);
      // This is the only currently registered destination after the legacy phone step.
      // The next registration screen can replace this navigation without changing the security contract.
      navigation.replace("Login");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save network security details."); }
    finally { setChecking(false); }
  }

  const rows: Array<[string, string]> = security ? [
    ["Your IP", maskIp(security.ip)], ["Connection", security.connection || "Unknown"], ["Country", security.country || security.countryCode || "Unknown"], ["Region", security.region || "Unknown"], ["City", security.city || "Unknown"], ["Organization", security.organization || "Unknown"], ["Company type", security.companyType || "Unknown"], ["ASN", security.asn ? `AS${security.asn}` : "Unknown"], ["Datacenter", security.datacenter || "None detected"], ["Fraud risk", `${security.fraudScore}% (${security.fraudLevel})`], ["Company abuse", `${security.companyAbuserScore}%`], ["ASN abuse", `${security.asnAbuserScore}%`],
  ] : [];

  return <ReDomScreen footer={<View style={styles.footer}><Text style={styles.muted}>{t("alreadyAccount")} <Text onPress={() => navigation.navigate("Login")} style={styles.link}>{t("login")}</Text></Text><View style={styles.company}><ReDomLogo width={72} height={20} /></View></View>}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ReDomLogo width={150} height={42} />
      <View style={styles.flow}><LockedKey width={20} height={20} /><Text style={styles.flowText}>{t("flowId", { flowId: flowMask(flowId) })}</Text><Text style={styles.expiry}>{countdown}</Text></View>
      <Text style={styles.title}><AIText context="ReDom signup phone title">What's Your Mobile Number?</AIText></Text>
      <Text style={styles.description}><AIText context="ReDom signup phone description">Enter the mobile number where you can be contacted.</AIText></Text>
      <Text style={styles.small}>Nobody will see this on your profile.</Text>
      <Pressable onPress={() => setCountryOpen(true)} disabled={checking || saved} style={styles.field}><Text style={styles.caption}>Country</Text><Text style={styles.fieldValue}>{country.name} <Text style={styles.blue}>{country.dialCode}</Text></Text></Pressable>
      <View style={[styles.field, styles.phoneField]}><Text style={styles.caption}>Phone Number</Text><TextInput value={phone} onChangeText={(v) => { setPhone(v); setSaved(false); setSecurity(null); setError(null); }} placeholder="Mobile number" placeholderTextColor="#8A8D91" keyboardType="phone-pad" style={styles.input} editable={!checking && !saved} maxLength={24} /></View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={() => void inspect()} disabled={!canContinue} style={[styles.button, !canContinue && styles.disabled]}>{checking ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Continue</Text>}</Pressable>
      <Pressable style={styles.email}><Text style={styles.muted}>Don't have phone number?</Text><Text style={styles.link}>Sign up with Email</Text></Pressable>
      <View style={styles.progress}>{[0,1,2,3,4,5].map((i) => <View key={i} style={[styles.dot, i <= 4 && styles.activeDot]} />)}</View>
    </ScrollView>

    <Modal visible={countryOpen} transparent animationType="slide" onRequestClose={() => setCountryOpen(false)}><View style={styles.overlay}><View style={styles.countrySheet}><View style={styles.sheetHead}><Text style={styles.sheetTitle}>Choose Country</Text><Pressable onPress={() => setCountryOpen(false)}><Text style={styles.link}>Close</Text></Pressable></View><View style={styles.search}><SearchIcon width={20} height={20} /><TextInput value={countrySearch} onChangeText={setCountrySearch} placeholder="Search country or code" placeholderTextColor="#8A8D91" style={styles.searchInput} /></View><FlatList data={filteredCountries} keyExtractor={(x) => x.code} renderItem={({ item }) => <Pressable onPress={() => { setCountry(item); setCountryOpen(false); }} style={styles.countryRow}><Text style={styles.fieldValue}>{item.name}</Text><Text style={styles.muted}>{item.dialCode}</Text></Pressable>} /></View></View></Modal>

    <Modal visible={checking} transparent animationType="fade"><View style={styles.checkOverlay}><View style={styles.checkCard}><ActivityIndicator size="large" color={BLUE} /><Text style={styles.checkTitle}>{stage === "phone" ? "Verifying your mobile number" : stage === "security" ? "Checking your Internet connection" : "Saving security details"}</Text><Text style={styles.checkBody}>{stage === "phone" ? "ReDom is validating your number with its permitted phone-validation providers." : stage === "security" ? "ReDom is receiving the complete IPAPI record for this Registration Flow ID." : "ReDom is attaching the reviewed network record to your Flow ID."}</Text></View></View></Modal>

    <Modal visible={securityOpen} transparent animationType="slide" onRequestClose={() => undefined}><View style={styles.overlay}><View style={styles.securitySheet}><ScrollView nestedScrollEnabled showsVerticalScrollIndicator contentContainerStyle={styles.securityContent}>
      <SecurityShield width={54} height={54} /><Text style={styles.securityTitle}>Connection & Security</Text><Text style={styles.securitySubtitle}>Review the network and security information detected from your current public Internet connection.</Text>
      {security ? <>
        <View style={styles.risk}><Text style={styles.riskTitle}>ReDom fraud risk: {security.fraudScore}%</Text><Text style={styles.riskBody}>{security.fraudLevel.toUpperCase()} {security.securitySignals.length ? `• ${security.securitySignals.join(" • ")}` : "• No elevated signals"}</Text></View>
        <View style={styles.rows}>{rows.map(([label, value]) => <View style={styles.row} key={label}><Text style={styles.muted}>{label}</Text><Text style={styles.value}>{value}</Text></View>)}</View>
        <View style={styles.signalBox}><Text style={styles.signalTitle}>Security signals</Text><Text style={styles.signal}>VPN: {security.vpn ? "Detected" : "Not detected"} • Proxy: {security.proxy ? "Detected" : "Not detected"}</Text><Text style={styles.signal}>Tor: {security.tor ? "Detected" : "Not detected"} • Automated traffic: {security.bot ? "Detected" : "Not detected"}</Text><Text style={styles.signal}>Datacenter: {security.datacenter ? "Detected" : "Not detected"} • Abuse: {security.abuser ? "Flagged" : "Not flagged"}</Text><Text style={styles.signal}>Bogon: {security.bogon ? "Detected" : "Not detected"} • Mobile: {security.mobile ? "Yes" : "No"} • Satellite: {security.satellite ? "Yes" : "No"}</Text></View>
        <View style={styles.raw}><Text style={styles.rawTitle}>Complete IPAPI details</Text><Text selectable style={styles.rawText}>{pretty(security.ipapi)}</Text></View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent((v) => !v)} style={styles.consent}><View style={[styles.checkbox, consent && styles.checked]}>{consent ? <CheckWhite width={17} height={17} /> : null}</View><Text style={styles.consentText}>I agree that ReDom may use my public IP and related network/security data to prevent abuse, fraud, automated activity, unauthorized access, and protect my registration and account security.</Text></Pressable>
        <Text style={styles.note}>This security record is attached to your Registration Flow ID for abuse-prevention and registration-security purposes. It is not published on your profile.</Text>
        <Pressable onPress={() => void acceptSecurity()} disabled={!consent || checking} style={[styles.button, (!consent || checking) && styles.disabled]}><Text style={styles.buttonText}>OK, Continue</Text></Pressable>
      </> : null}
    </ScrollView></View></View></Modal>
  </ReDomScreen>;
}

const styles = StyleSheet.create({content:{flexGrow:1,width:"100%",maxWidth:420,alignSelf:"center",alignItems:"center",paddingTop:20,paddingBottom:20},flow:{alignItems:"center",marginVertical:14,gap:4},flowText:{color:BLUE,fontSize:13,fontWeight:"800"},expiry:{color:MUTED,fontSize:13},title:{color:TEXT,fontSize:27,fontWeight:"800",textAlign:"center",marginTop:8},description:{color:TEXT,fontSize:15,textAlign:"center",marginTop:8},small:{color:MUTED,fontSize:13,marginTop:4,marginBottom:18},field:{width:"100%",minHeight:64,borderWidth:1.5,borderColor:BORDER,borderRadius:13,padding:13,justifyContent:"center"},phoneField:{marginTop:10},caption:{color:MUTED,fontSize:11,fontWeight:"700"},fieldValue:{color:TEXT,fontSize:15,fontWeight:"700",marginTop:3},blue:{color:BLUE},input:{color:TEXT,fontSize:16,height:28,padding:0,marginTop:3},error:{color:ERROR,fontSize:13,fontWeight:"600",textAlign:"center",marginTop:10},button:{width:"100%",height:54,borderRadius:13,backgroundColor:BLUE,alignItems:"center",justifyContent:"center",marginTop:16},buttonText:{color:"#FFF",fontSize:17,fontWeight:"800"},disabled:{opacity:.5},email:{alignItems:"center",marginTop:13,gap:2},muted:{color:MUTED,fontSize:13},link:{color:BLUE,fontSize:14,fontWeight:"800"},progress:{flexDirection:"row",gap:8,marginTop:22},dot:{width:8,height:8,borderRadius:4,backgroundColor:"#D8DCE1"},activeDot:{width:24,backgroundColor:BLUE},footer:{alignItems:"center"},company:{marginTop:8},overlay:{flex:1,backgroundColor:"rgba(0,0,0,.45)",justifyContent:"flex-end"},countrySheet:{height:"82%",backgroundColor:"#FFF",borderTopLeftRadius:24,borderTopRightRadius:24,padding:20},sheetHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:14},sheetTitle:{color:TEXT,fontSize:21,fontWeight:"800"},search:{height:48,borderWidth:1,borderColor:BORDER,borderRadius:12,flexDirection:"row",alignItems:"center",paddingHorizontal:10,gap:8},searchInput:{flex:1,color:TEXT,fontSize:15},countryRow:{minHeight:54,borderBottomWidth:1,borderBottomColor:"#EEF0F2",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},checkOverlay:{flex:1,backgroundColor:"rgba(0,0,0,.45)",alignItems:"center",justifyContent:"center",padding:25},checkCard:{width:"100%",maxWidth:360,backgroundColor:"#FFF",borderRadius:22,padding:28,alignItems:"center"},checkTitle:{color:TEXT,fontSize:20,fontWeight:"800",textAlign:"center",marginTop:15},checkBody:{color:MUTED,fontSize:14,lineHeight:21,textAlign:"center",marginTop:8},securitySheet:{height:"94%",backgroundColor:"#FFF",borderTopLeftRadius:26,borderTopRightRadius:26,padding:20},securityContent:{alignItems:"center",paddingBottom:30},securityTitle:{color:TEXT,fontSize:24,fontWeight:"800",textAlign:"center",marginTop:8},securitySubtitle:{color:MUTED,fontSize:13,lineHeight:19,textAlign:"center",marginTop:6},risk:{width:"100%",backgroundColor:"#F5F6F7",borderRadius:14,padding:14,marginTop:16},riskTitle:{color:TEXT,fontSize:16,fontWeight:"800"},riskBody:{color:MUTED,fontSize:12,lineHeight:18,marginTop:5},rows:{width:"100%",marginTop:14},row:{minHeight:42,borderBottomWidth:1,borderBottomColor:"#EEF0F2",flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12},value:{color:TEXT,fontSize:13,fontWeight:"700",textAlign:"right",flex:1},signalBox:{width:"100%",backgroundColor:"#F5F6F7",borderRadius:14,padding:14,marginTop:14},signalTitle:{color:TEXT,fontSize:14,fontWeight:"800",marginBottom:6},signal:{color:MUTED,fontSize:12,lineHeight:19},raw:{width:"100%",backgroundColor:"#111827",borderRadius:14,padding:14,marginTop:14},rawTitle:{color:"#FFF",fontSize:14,fontWeight:"800",marginBottom:8},rawText:{color:"#E5E7EB",fontSize:10,lineHeight:15,fontFamily:Platform.OS === "ios" ? "Menlo" : "monospace"},consent:{width:"100%",flexDirection:"row",alignItems:"flex-start",gap:11,borderWidth:1,borderColor:BORDER,borderRadius:12,padding:12,marginTop:16},checkbox:{width:24,height:24,borderWidth:2,borderColor:"#8A8D91",borderRadius:6,alignItems:"center",justifyContent:"center"},checked:{backgroundColor:BLUE,borderColor:BLUE},consentText:{flex:1,color:TEXT,fontSize:13,lineHeight:19},note:{width:"100%",color:MUTED,fontSize:11,lineHeight:17,marginTop:9}});
