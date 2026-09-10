import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../../assets/brand/redom-logo.svg";
import LockedKey from "../../assets/auth/locked-key.svg";
import EmailIcon from "../../assets/auth/email.svg";
import { useLanguage } from "../../i18n/LanguageProvider";
import { authService } from "../../auth/service";
import { REGISTRATION_EMAIL_PROVIDERS, getRegistrationEmailProvider, normalizeRegistrationEmail } from "../../data/registrationEmailProviders";
import type { RootStackParamList } from "../../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationEmail">;
const BLUE = "#1877F2";
const TEXT = "#1C1E21";
const MUTED = "#65676B";
const BORDER = "#CCD0D5";
const ERROR = "#E41E3F";

const flowMask = (value: string) => `${value.slice(0, 4)}${"•".repeat(Math.max(0, value.length - 4))}√`;

export function RegistrationEmailScreen({ navigation, route }: Props) {
  const { flowId } = route.params;
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState("Ready to validate");
  const spin = useRef(new Animated.Value(0)).current;

  const provider = useMemo(() => getRegistrationEmailProvider(email), [email]);
  const canContinue = email.trim().length >= 5 && !busy && !success;
  const allowedText = REGISTRATION_EMAIL_PROVIDERS.map((item) => `${item.name}: ${item.domains.join(", ")}`).join("  •  ");

  async function continueWithEmail() {
    if (!canContinue) return;
    const normalized = normalizeRegistrationEmail(email);
    setError(null);
    setBusy(true);
    setSuccess(false);
    spin.setValue(0);
    const animation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 850, easing: Easing.linear, useNativeDriver: true }));
    animation.start();

    try {
      setPhase("Checking email characters…");
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Please enter a valid email address.");

      setPhase("Checking lowercase format…");
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (normalized !== email.trim()) throw new Error("Please use lowercase characters in your email address.");

      setPhase("Checking supported email provider…");
      await new Promise((resolve) => setTimeout(resolve, 450));
      if (!provider) throw new Error("ReDom doesn't accept unaffiliated email addresses. Please use a Google, Microsoft, or Yahoo email address from the supported list below.");

      setPhase("Saving email details to your Flow ID…");
      await new Promise((resolve) => setTimeout(resolve, 350));
      setPhase("Sending verification email with ReSend…");
      await authService.saveRegistrationFlowEmail({ reservationId: route.params.reservationId, flowId, deviceId: route.params.deviceId, email: normalized });
      setPhase("Email details saved");
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save this email address.");
      setPhase("Ready to validate");
    } finally {
      animation.stop();
      setBusy(false);
    }
  }

  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.handle} />
          <View style={styles.flow}><LockedKey width={20} height={20} /><Text style={styles.flowText}>{t("flowId", { flowId: flowMask(flowId) })}</Text></View>
          <ReDomLogo width={150} height={42} />
          <Text style={styles.title}>What's Your Email Address?</Text>
          <Text style={styles.description}>Enter the email address where you can be contacted.</Text>
          <Text style={styles.small}>Nobody will see this on your profile.</Text>

          <View style={[styles.field, focused && styles.fieldFocused]}>
            <Animated.Text style={[styles.label, (focused || email.length > 0) && styles.labelFloating]}>Email Address</Animated.Text>
            <TextInput
              value={email}
              onChangeText={(value) => { setEmail(value.toLowerCase()); setError(null); setSuccess(false); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder={focused || email.length > 0 ? "" : "Email Address"}
              placeholderTextColor="#8A8D91"
              style={styles.input}
              editable={!busy && !success}
              maxLength={320}
            />
          </View>

          <Text style={styles.providerHint}>Supported email providers</Text>
          <Text style={styles.providerList}>{allowedText}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable onPress={() => void continueWithEmail()} disabled={!canContinue} style={[styles.button, !canContinue && styles.disabled]}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>{success ? "Email Saved" : "Continue"}</Text>}
          </Pressable>

          <Pressable onPress={() => navigation.goBack()} disabled={busy} style={styles.phoneLink}>
            <Text style={styles.muted}>Don't have email?</Text>
            <Text style={styles.link}>Sign up with Mobile Number</Text>
          </Pressable>

          <View style={styles.progress}>{[0,1,2,3,4,5].map((i) => <View key={i} style={[styles.dot, i <= 4 && styles.activeDot]} />)}</View>
          <View style={styles.company}><ReDomLogo width={72} height={20} /></View>
        </ScrollView>
      </View>

      {busy ? (
        <View style={styles.phaseOverlay} pointerEvents="none">
          <View style={styles.phaseCard}>
            <Animated.View style={[styles.spinner, { transform: [{ rotate: rotation }] }]}>
              <View style={styles.spinnerTrack} />
            </Animated.View>
            <View style={styles.emailIconCircle}><EmailIcon width={34} height={34} /></View>
            <Text style={styles.phaseTitle}>{phase}</Text>
            <Text style={styles.phaseBody}>ReDom is securely validating and saving your email address.</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay:{flex:1,backgroundColor:"rgba(0,0,0,.42)",justifyContent:"flex-end"},
  sheet:{height:"92%",backgroundColor:"#FFF",borderTopLeftRadius:28,borderTopRightRadius:28},
  content:{flexGrow:1,width:"100%",maxWidth:430,alignSelf:"center",alignItems:"center",padding:22,paddingBottom:34},
  handle:{width:44,height:5,borderRadius:3,backgroundColor:"#D8DCE1",marginBottom:17},
  flow:{flexDirection:"row",alignItems:"center",gap:6,marginBottom:18},flowText:{color:BLUE,fontSize:13,fontWeight:"800"},
  title:{color:TEXT,fontSize:27,lineHeight:33,fontWeight:"800",textAlign:"center",marginTop:18},
  description:{color:TEXT,fontSize:15,lineHeight:22,textAlign:"center",marginTop:9},small:{color:MUTED,fontSize:13,marginTop:4,marginBottom:20},
  field:{width:"100%",height:64,borderWidth:1.5,borderColor:BORDER,borderRadius:13,paddingHorizontal:14,justifyContent:"center",position:"relative"},fieldFocused:{borderColor:BLUE},
  label:{position:"absolute",left:14,color:"#8A8D91",fontSize:16,top:20},labelFloating:{top:-9,left:11,paddingHorizontal:6,backgroundColor:"#FFF",color:BLUE,fontSize:11,fontWeight:"800"},
  input:{width:"100%",height:32,color:TEXT,fontSize:16,padding:0,marginTop:4},
  providerHint:{width:"100%",color:TEXT,fontSize:12,fontWeight:"800",marginTop:12},providerList:{width:"100%",color:MUTED,fontSize:10.5,lineHeight:16,marginTop:4},
  error:{width:"100%",color:ERROR,fontSize:13,lineHeight:19,fontWeight:"600",marginTop:10},
  button:{width:"100%",height:54,borderRadius:13,backgroundColor:BLUE,alignItems:"center",justifyContent:"center",marginTop:17},buttonText:{color:"#FFF",fontSize:17,fontWeight:"800"},disabled:{opacity:.5},
  phoneLink:{alignItems:"center",marginTop:14,gap:2},muted:{color:MUTED,fontSize:13},link:{color:BLUE,fontSize:13,fontWeight:"800"},
  progress:{flexDirection:"row",justifyContent:"center",gap:8,marginTop:21},dot:{width:8,height:8,borderRadius:4,backgroundColor:"#D8DCE1"},activeDot:{width:24,backgroundColor:BLUE},company:{marginTop:14},
  phaseOverlay:{position:"absolute",left:0,right:0,top:0,bottom:0,backgroundColor:"rgba(0,0,0,.46)",alignItems:"center",justifyContent:"center",padding:24},phaseCard:{width:"100%",maxWidth:350,borderRadius:24,backgroundColor:"#FFF",padding:26,alignItems:"center"},
  spinner:{position:"absolute",width:94,height:94,borderRadius:47,alignItems:"center",justifyContent:"center"},spinnerTrack:{width:94,height:94,borderRadius:47,borderWidth:4,borderColor:BLUE,borderRightColor:"transparent",borderBottomColor:"transparent"},emailIconCircle:{width:68,height:68,borderRadius:34,backgroundColor:"#F1F3F6",alignItems:"center",justifyContent:"center"},phaseTitle:{color:TEXT,fontSize:18,lineHeight:23,fontWeight:"800",textAlign:"center",marginTop:19},phaseBody:{color:MUTED,fontSize:13,lineHeight:19,textAlign:"center",marginTop:7}
});
