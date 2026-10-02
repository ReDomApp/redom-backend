import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import MoreIcon from "../assets/navigation/more.svg";
import CloseIcon from "../assets/navigation/close.svg";
import ChevronRight from "../assets/auth/chevron-right.svg";
import CheckboxEmpty from "../assets/auth/checkbox-empty.svg";
import CheckboxChecked from "../assets/auth/checkbox-checked.svg";
import NeutralAvatar from "../assets/auth/neutral-avatar.svg";
import { ReDomScreen } from "../layout/ReDomScreen";
import { getDeviceAccounts, type DeviceAccount } from "../auth/deviceAccounts";
import { fetchNetworkProvider, getNetworkSecurity } from "../auth/networkProvider";
import { LANGUAGES } from "../i18n/language";
import { useLanguage } from "../i18n/LanguageProvider";
import type { RootStackParamList } from "../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "RecognizedAccounts">;
const TEXT="#1C1E21", MUTED="#65676B", BORDER="#CCD0D5", BLUE="#1877F2";

export function RecognizedAccountsScreen({navigation}:Props){
 const [accounts,setAccounts]=useState<DeviceAccount[]>([]); const [loading,setLoading]=useState(true); const [languageOpen,setLanguageOpen]=useState(false); const {language,setLanguage}=useLanguage(); const [networkName,setNetworkName]=useState<string|null>(getNetworkSecurity().networkProvider); const [termsUrl,setTermsUrl]=useState<string|null>(getNetworkSecurity().termsUrl);
 useEffect(()=>{let live=true;(async()=>{try{const [a,n]=await Promise.all([getDeviceAccounts(),fetchNetworkProvider()]);if(!live)return;setAccounts(a);setNetworkName(n.networkProvider);setTermsUrl(n.termsUrl);if(!a.length)navigation.replace("Login");}catch{if(live)navigation.replace("Login")}finally{if(live)setLoading(false)}})();return()=>{live=false}},[navigation]);
 const languageName=useMemo(()=>language==="en"?"English (US)":LANGUAGES.find(x=>x.code===language)?.nativeName||"English (US)",[language]);
 const agreementFallback="By proceeding, you agree to your network provider's applicable Terms which includes letting ReDom request and receive your phone number.";

 return <ReDomScreen><View style={s.container}>
  <View style={s.top}><View style={s.side}/><Pressable onPress={()=>setLanguageOpen(true)} style={s.languageTrigger}><Text style={s.language}>{languageName}</Text><ChevronRight width={20} height={20} style={s.downIcon}/></Pressable><Pressable onPress={()=>navigation.navigate("ManageProfiles")} hitSlop={12}><MoreIcon width={27} height={27}/></Pressable></View>
  <View style={s.logo}><ReDomLogo width={94} height={94}/></View>
  <View style={s.notice}>{networkName?<><Text style={s.noticeText}>By proceeding, you agree to </Text><Pressable disabled={!termsUrl} onPress={()=>termsUrl&&Linking.openURL(termsUrl)}><Text style={s.link}>{networkName+"'s Terms"}</Text></Pressable><Text style={s.noticeText}> which includes letting {networkName} request and receive your phone number. </Text></>:<Text style={s.noticeText}>{agreementFallback} </Text>}<Pressable><Text style={s.link}>Change Settings</Text></Pressable></View>
  <View style={s.accounts}>{loading?<ActivityIndicator size="large" color={BLUE}/>:accounts.map(a=><Pressable key={a.user.id} style={s.card} onPress={()=>navigation.navigate("RecognizedPassword",{userId:a.user.id})}><View style={s.avatar}>{a.user.profilePhoto?<Image source={{uri:a.user.profilePhoto}} style={s.avatarImage}/>:<NeutralAvatar width={72} height={72}/>}</View><Text numberOfLines={1} style={s.name}>{a.user.firstName} {a.user.lastName}</Text><ChevronRight width={25} height={25}/></Pressable>)}</View>
  <View style={s.actions}><Pressable onPress={()=>navigation.navigate("Login")} style={s.other}><Text style={s.otherText}>Log into another account</Text></Pressable><Pressable onPress={()=>navigation.navigate("RegistrationWelcome")} style={s.create}><Text style={s.createText}>Create new account</Text></Pressable></View>
 </View>
 <Modal visible={languageOpen} transparent animationType="slide" onRequestClose={()=>setLanguageOpen(false)}><View style={s.backdrop}><View style={s.sheet}><View style={s.handle}/><Pressable style={s.close} onPress={()=>setLanguageOpen(false)}><CloseIcon width={32} height={32}/></Pressable><Text style={s.sheetTitle}>Select your language</Text><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.languageList}>{LANGUAGES.map(item=>{const selected=item.code===language;return <Pressable key={item.code} onPress={async()=>{await setLanguage(item.code);setLanguageOpen(false)}} style={s.languageRow}><Text style={s.languageRowText}>{item.code==="en"?"English (US)":item.nativeName}</Text>{selected?<CheckboxChecked width={27} height={27}/>:<CheckboxEmpty width={27} height={27}/>}</Pressable>})}</ScrollView></View></View></Modal>
 </ReDomScreen>;
}
const s=StyleSheet.create({container:{flex:1,paddingTop:8},top:{height:48,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20},side:{width:27},languageTrigger:{flexDirection:"row",alignItems:"center",gap:5},language:{fontSize:17,color:TEXT},downIcon:{transform:[{rotate:"90deg"}],opacity:.8},logo:{alignItems:"center",marginTop:55,marginBottom:74},notice:{marginHorizontal:30,paddingVertical:28,borderTopWidth:1,borderBottomWidth:1,borderColor:"#E4E6EB",flexDirection:"row",flexWrap:"wrap"},noticeText:{fontSize:17,lineHeight:25,color:"#050505"},link:{fontSize:17,lineHeight:25,color:BLUE,fontWeight:"800"},accounts:{gap:18,paddingHorizontal:30,paddingTop:30},card:{minHeight:126,borderWidth:1,borderColor:BORDER,borderRadius:24,paddingHorizontal:27,flexDirection:"row",alignItems:"center",gap:22},avatar:{width:72,height:72,borderRadius:36,overflow:"hidden",backgroundColor:"#E1E4E8",alignItems:"center",justifyContent:"center"},avatarImage:{width:72,height:72},initial:{fontSize:30,color:MUTED},name:{flex:1,fontSize:20,color:TEXT,fontWeight:"700"},actions:{paddingHorizontal:30,marginTop:22,gap:10},other:{height:55,borderRadius:18,backgroundColor:"#F0F2F5",alignItems:"center",justifyContent:"center"},otherText:{fontSize:18,fontWeight:"700",color:TEXT},create:{height:55,borderWidth:2,borderColor:BLUE,borderRadius:18,alignItems:"center",justifyContent:"center"},createText:{fontSize:18,fontWeight:"700",color:BLUE},backdrop:{flex:1,backgroundColor:"rgba(0,0,0,.55)",justifyContent:"flex-end"},sheet:{height:"72%",backgroundColor:"#FFF",borderTopLeftRadius:28,borderTopRightRadius:28,paddingTop:11},handle:{width:42,height:5,borderRadius:3,backgroundColor:"#D6D9DD",alignSelf:"center",marginBottom:15},close:{position:"absolute",left:24,top:55},sheetTitle:{fontSize:29,fontWeight:"800",color:"#050505",paddingHorizontal:30,paddingTop:60,paddingBottom:28},languageList:{paddingHorizontal:30,paddingBottom:30},languageRow:{minHeight:76,borderWidth:1,borderColor:"#E4E6EB",borderBottomWidth:0,paddingHorizontal:30,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},languageRowText:{fontSize:18,color:TEXT}});
