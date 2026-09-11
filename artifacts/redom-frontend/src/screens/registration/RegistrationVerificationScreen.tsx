import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../../assets/brand/redom-logo.svg";
import InfoBlack from "../../assets/auth/info-black.svg";
import { authService } from "../../auth/service";
import { getDeviceId } from "../../utils/device";
import type { RootStackParamList } from "../../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "RegistrationVerification">;
const BLUE="#1877F2", TEXT="#1C1E21", MUTED="#65676B", BORDER="#CCD0D5", ERROR="#E41E3F", SUCCESS="#168A3A";
const RESEND_WAIT=120;
function formatTimer(value:number){return `${Math.floor(value/60).toString().padStart(2,"0")}:${(value%60).toString().padStart(2,"0")}`;}

export function RegistrationVerificationScreen({route,navigation}:Props){
 const [verificationChallengeId,setVerificationChallengeId]=useState(route.params.verificationChallengeId);
 const [flowId,setFlowId]=useState(route.params.flowId);
 const [channel,setChannel]=useState<"sms"|"email">(route.params.channel);
 const [maskedTarget,setMaskedTarget]=useState(route.params.maskedTarget);
 const [expiresAt,setExpiresAt]=useState(route.params.expiresAt);
 const [seconds,setSeconds]=useState(RESEND_WAIT);
 const [code,setCode]=useState("");
 const [busy,setBusy]=useState(false);
 const [verified,setVerified]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const countdown=useMemo(()=>formatTimer(seconds),[seconds]);
 useEffect(()=>{const timer=setInterval(()=>setSeconds(value=>Math.max(value-1,0)),1000);return()=>clearInterval(timer);},[]);
 const codeExpired=Date.now()>=new Date(expiresAt).getTime();
 const canVerify=code.length===6&&!busy&&!verified&&!codeExpired;

 async function verify(){
  if(!canVerify)return;
  setBusy(true);setError(null);
  try{
   const result=await authService.verifyRegistrationChallenge(verificationChallengeId,code);
   if(!result.success)throw new Error(result.message||"Verification failed.");
   setVerified(true);setCode("");
   setTimeout(()=>navigation.replace("Login"),1500);
  }catch(e){
   const message=e instanceof Error?e.message:"Verification failed.";
   if(/expired/i.test(message)) setError("Verification code has expired.");
   else if(/invalid|incorrect/i.test(message)) setError("Verification Code Is Incorrect.");
   else setError(message);
  }finally{setBusy(false);}
 }

 async function resend(){
  if(seconds>0||busy||verified)return;
  setBusy(true);setError(null);
  try{
   const deviceId=route.params.deviceId??await getDeviceId();
   const result=await authService.resendRegistrationVerification({verificationChallengeId,reservationId:route.params.reservationId??"",flowId,deviceId});
   setVerificationChallengeId(result.verificationChallengeId);setFlowId(result.rawFlowId);setChannel(result.channel);setMaskedTarget(result.maskedTarget);setExpiresAt(result.expiresAt);setSeconds(RESEND_WAIT);setCode("");
  }catch(e){setError(e instanceof Error?e.message:"Unable to resend the verification code.");}
  finally{setBusy(false);}
 }

 return <KeyboardAvoidingView style={s.root} behavior={Platform.OS==="ios"?"padding":undefined}>
  <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
   <ReDomLogo width={154} height={44}/>
   <View style={s.flowRow}><InfoBlack width={19} height={19}/><Text style={s.flow}>Flow ID: {flowId}</Text></View>
   <Text style={s.title}>{verified?"Registration Verified":"Verify Your Registration"}</Text>
   <Text style={s.description}>{verified?"Verification code successful. Your registration is complete.":<>Please input the 6-digit registration code sent to <Text style={s.target}>{maskedTarget}</Text>.</>}</Text>
   {!verified?<>
    <View style={[s.field,code.length>0&&s.fieldFilled]}><Text style={[s.label,code.length>0&&s.labelFloating]}>Verification Code</Text><TextInput value={code} onChangeText={value=>{setCode(value.replace(/\D/g,"").slice(0,6));setError(null);}} keyboardType="number-pad" maxLength={6} autoFocus style={s.input} placeholder={code.length===0?"000000":""} placeholderTextColor="#9A9DA1" editable={!busy&&!codeExpired}/></View>
    <Text style={s.entryNote}>Verification Code will not exceed 6 digits.</Text>
    <Text style={s.timer}>{codeExpired?"Verification code has expired.":`Resend available in ${countdown}`}</Text>
    {error?<Text style={s.error}>{error}</Text>:null}
    <Pressable disabled={!canVerify} onPress={()=>void verify()} style={[s.button,!canVerify&&s.disabled]}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.buttonText}>Verify Registration</Text>}</Pressable>
    <View style={s.resendRow}><Text style={s.muted}>I didn't receive the code?</Text><Pressable disabled={seconds>0||busy} onPress={()=>void resend()}><Text style={[s.link,(seconds>0||busy)&&s.linkDisabled]}>{seconds>0?`Resend (${countdown})`:"Resend"}</Text></Pressable></View>
   </>:<View style={s.successCard}><Text style={s.successTitle}>✓ Verification code successful</Text><Text style={s.successBody}>Your registration has been verified successfully. Please wait while ReDom redirects you to Login.</Text></View>}
   <View style={s.footer}><Text style={s.copy}>© ReDom</Text><ReDomLogo width={82} height={23}/></View>
  </ScrollView>
 </KeyboardAvoidingView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:"#FFF"},content:{flexGrow:1,width:"100%",maxWidth:430,alignSelf:"center",alignItems:"center",padding:22,paddingTop:38,paddingBottom:30},flowRow:{flexDirection:"row",alignItems:"center",gap:6,marginTop:24},flow:{color:BLUE,fontSize:12.5,fontWeight:"900"},title:{fontSize:29,lineHeight:35,fontWeight:"900",color:TEXT,textAlign:"center",marginTop:25},description:{fontSize:15,lineHeight:22,color:TEXT,textAlign:"center",marginTop:10},target:{fontWeight:"900",color:BLUE},field:{width:"100%",height:64,borderWidth:1.5,borderColor:BORDER,borderRadius:14,justifyContent:"center",position:"relative",marginTop:27},fieldFilled:{borderColor:BLUE},label:{position:"absolute",left:14,top:20,fontSize:16,color:"#8A8D91",backgroundColor:"#FFF"},labelFloating:{top:-9,left:11,paddingHorizontal:6,fontSize:11,fontWeight:"900",color:BLUE},input:{width:"100%",height:42,textAlign:"center",fontSize:25,fontWeight:"900",letterSpacing:7,color:TEXT,padding:0,paddingTop:5},entryNote:{width:"100%",fontSize:11.5,color:MUTED,textAlign:"center",marginTop:8},timer:{fontSize:13,color:MUTED,fontWeight:"700",marginTop:13},error:{color:ERROR,fontSize:13,lineHeight:19,fontWeight:"700",textAlign:"center",marginTop:10},button:{width:"100%",height:55,borderRadius:14,backgroundColor:BLUE,alignItems:"center",justifyContent:"center",marginTop:21},disabled:{opacity:.5},buttonText:{color:"#FFF",fontSize:16.5,fontWeight:"900"},resendRow:{flexDirection:"row",alignItems:"center",gap:5,marginTop:18},muted:{color:MUTED,fontSize:13},link:{color:BLUE,fontSize:13,fontWeight:"900"},linkDisabled:{color:"#A8ABB0"},successCard:{width:"100%",marginTop:27,borderRadius:17,padding:18,backgroundColor:"#F1FAF3",borderWidth:1,borderColor:"#B9E3C2"},successTitle:{color:SUCCESS,fontSize:16,fontWeight:"900",textAlign:"center"},successBody:{color:TEXT,fontSize:13.5,lineHeight:20,textAlign:"center",marginTop:8},footer:{alignItems:"center",gap:6,marginTop:"auto",paddingTop:55},copy:{color:MUTED,fontSize:12}});
