import { useEffect, useState } from "react";
import { Alert, Clipboard, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, View, Linking } from "react-native";
import QRCode from "qrcode";
import Svg, { Rect } from "react-native-svg";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { groupService } from "../messages/groupService";
import { GroupActionIcon } from "../components/GroupActionIcon";

function QrSvg({ value, size=220 }: { value: string; size?: number }) {
  const [matrix, setMatrix] = useState<number[][]>([]);
  useEffect(() => { QRCode.create(value, { errorCorrectionLevel: "M" }).modules; const qr=QRCode.create(value,{errorCorrectionLevel:"M"}); const out:number[][]=[]; for(let y=0;y<qr.modules.size;y++){const row:number[]=[];for(let x=0;x<qr.modules.size;x++)row.push(qr.modules.get(x,y)?1:0);out.push(row);} setMatrix(out); }, [value]);
  const n=matrix.length||1, cell=size/n;
  return <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>{matrix.flatMap((row,y)=>row.map((v,x)=>v?<Rect key={`${x}-${y}`} x={x*cell} y={y*cell} width={cell+.2} height={cell+.2} fill="#111"/>:null))}</Svg>;
}

export function GroupInviteScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList,"GroupInvite">) {
 const [data,setData]=useState<{link:string;token:string;group: any}|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
 const load=async()=>{setLoading(true);try{const result=route.params.token?await groupService.previewInvite(route.params.token):await groupService.getInvite(route.params.conversationId);setData({link:result.link,token:route.params.token??(result as any).token,group:result.group});}catch(e){setError(e instanceof Error?e.message:"Invite unavailable.");}finally{setLoading(false);}};
 useEffect(()=>{void load();},[route.params.conversationId,route.params.token]);
 const copy=async()=>{if(!data)return;Clipboard.setString(data.link);Alert.alert("Link copied","The group invite link is on your clipboard.");};
 const share=async()=>{if(!data)return;await Share.share({message:`Join ${data.group.groupName} on ReDom:\n${data.link}`});};
 const sms=async()=>{if(!data)return;await Linking.openURL(`sms:?body=${encodeURIComponent(`Join ${data.group.groupName} on ReDom: ${data.link}`)}`);};
 const email=async()=>{if(!data)return;await Linking.openURL(`mailto:?subject=${encodeURIComponent(`Join ${data.group.groupName} on ReDom`)}&body=${encodeURIComponent(data.link)}`);};
 const reset=()=>Alert.alert("Reset link","The current link will stop working and a new link will be created.",[ {text:"Cancel",style:"cancel"},{text:"Reset",style:"destructive",onPress:async()=>{try{const r=await groupService.resetInvite(route.params.conversationId);setData(d=>d?{...d,link:r.link,token:r.token}:d);}catch(e){setError(e instanceof Error?e.message:"Unable to reset link.");}}}]);
 if(loading)return <SafeAreaView style={s.root}><Text style={s.center}>Loading…</Text></SafeAreaView>;
 if(!data)return <SafeAreaView style={s.root}><Text style={s.error}>{error||"Invite unavailable."}</Text></SafeAreaView>;
 return <SafeAreaView style={s.root}><View style={s.header}><Pressable onPress={()=>navigation.goBack()}><GroupActionIcon kind="back" size={30} color="#111"/></Pressable><Text style={s.title}>Group link</Text><View style={{width:30}}/></View><ScrollView contentContainerStyle={s.content}>
  <View style={s.hero}><View style={s.avatar}><Text style={s.avatarText}>{(data.group.groupName||"G").slice(0,1).toUpperCase()}</Text></View><Text style={s.name}>{data.group.groupName}</Text><Text style={s.link}>{data.link}</Text></View>
  <Action icon="copy" title="Copy link" onPress={()=>void copy()}/><Action icon="share" title="Share link" onPress={()=>void share()}/><Action icon="sms" title="Send link via SMS" onPress={()=>void sms()}/><Action icon="email" title="Send link via email" onPress={()=>void email()}/><Action icon="qr" title="QR code" onPress={()=>Alert.alert("QR code","Scan this code to open the group invite.",undefined)}/>
  <View style={s.qrCard}><QrSvg value={data.link}/><Text style={s.qrHint}>Scan to join this group</Text></View>
  <Pressable style={s.reset} onPress={reset}><GroupActionIcon kind="reset" color="#C9184A"/><Text style={s.resetText}>Reset link</Text></Pressable>
  <Text style={s.note}>Only share this link with people you trust. If the link is reset, the previous link can no longer be used.</Text>
 </ScrollView></SafeAreaView>;
}
function Action({icon,title,onPress}:{icon:any;title:string;onPress:()=>void}){return <Pressable style={s.action} onPress={onPress}><GroupActionIcon kind={icon}/><Text style={s.actionText}>{title}</Text></Pressable>}
const s=StyleSheet.create({root:{flex:1,backgroundColor:"#FFF"},header:{height:58,borderBottomWidth:1,borderBottomColor:"#E5E7EB",flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:18},title:{fontSize:20,fontWeight:"700",color:"#111827"},content:{paddingBottom:40},hero:{padding:26,alignItems:"center",borderBottomWidth:1,borderBottomColor:"#E5E7EB"},avatar:{width:74,height:74,borderRadius:37,backgroundColor:"#1877F2",alignItems:"center",justifyContent:"center"},avatarText:{fontSize:30,fontWeight:"800",color:"#FFF"},name:{fontSize:20,fontWeight:"700",marginTop:12,color:"#111827"},link:{fontSize:14,color:"#218B67",marginTop:5,textAlign:"center"},action:{height:62,flexDirection:"row",alignItems:"center",paddingHorizontal:30,borderBottomWidth:1,borderBottomColor:"#F0F2F5",gap:22},actionText:{fontSize:17,color:"#111827"},qrCard:{alignItems:"center",padding:22},qrHint:{marginTop:12,color:"#667085"},reset:{height:62,flexDirection:"row",alignItems:"center",paddingHorizontal:30,gap:22,borderTopWidth:1,borderTopColor:"#F0F2F5"},resetText:{fontSize:17,color:"#C9184A"},note:{padding:24,color:"#667085",lineHeight:21},center:{flex:1,textAlign:"center",marginTop:40,color:"#667085"},error:{padding:24,color:"#B42318"}});