import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { groupService, type GroupSettings } from "../messages/groupService";
import { GroupActionIcon } from "../components/GroupActionIcon";

export function GroupPermissionsScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList,"GroupPermissions">) {
 const [group,setGroup]=useState<GroupSettings|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
 const load=useCallback(async()=>{setLoading(true);try{const r=await groupService.getSettings(route.params.conversationId);setGroup(r.settings);}catch(e){setError(e instanceof Error?e.message:"Unable to load permissions.");}finally{setLoading(false);}},[route.params.conversationId]);
 useEffect(()=>{void load();},[load]);
 const set=async(key:keyof GroupSettings,value:boolean)=>{if(!group?.isAdmin)return;const previous=group[key] as boolean;setGroup({...group,[key]:value});try{await groupService.updateSettings(route.params.conversationId,{[key]:value} as any);}catch(e){setGroup({...group,[key]:previous});Alert.alert("Unable to change setting",e instanceof Error?e.message:"Please try again.");}};
 if(loading)return <SafeAreaView style={s.root}><ActivityIndicator style={{marginTop:40}} color="#1877F2"/></SafeAreaView>;
 if(!group)return <SafeAreaView style={s.root}><Text style={s.error}>{error||"Group unavailable."}</Text></SafeAreaView>;
 return <SafeAreaView style={s.root}><View style={s.header}><Pressable onPress={()=>navigation.goBack()}><GroupActionIcon kind="back" size={30} color="#111"/></Pressable><View><Text style={s.title}>Group permissions</Text><Text style={s.subtitle}>{group.groupName}</Text></View><View style={{width:30}}/></View><ScrollView contentContainerStyle={s.content}>
  <Text style={s.section}>Members can:</Text>
  <Permission icon="settings" title="Edit group settings" description="Name, icon, description, disappearing messages, and pinned messages." value={group.anyoneCanEditInfo} enabled={group.isAdmin} onChange={v=>void set("anyoneCanEditInfo",v)}/>
  <Permission icon="history" title="Send new messages" description="Allow members to send messages in the group." value={group.anyoneCanSendMessages} enabled={group.isAdmin} onChange={v=>void set("anyoneCanSendMessages",v)}/>
  <Permission icon="members" title="Add other members" description="Allow members to add people to the group." value={group.anyoneCanInvite} enabled={group.isAdmin} onChange={v=>void set("anyoneCanInvite",v)}/>
  <Permission icon="history" title="Send message history" description="Allow members who add someone to send recent group history." value={group.anyoneCanSendHistory} enabled={group.isAdmin} onChange={v=>void set("anyoneCanSendHistory",v)}/>
  <Permission icon="link" title="Invite via link or QR code" description="Allow members to create and share group invite links." value={group.anyoneCanInvite} enabled={group.isAdmin} onChange={v=>void set("anyoneCanInvite",v)}/>
  <Text style={s.section}>Admins can:</Text>
  <Permission icon="approval" title="Approve new members" description="When enabled, people joining through an invite must be approved by an admin." value={group.joinApprovalRequired} enabled={group.isAdmin} onChange={v=>void set("joinApprovalRequired",v)}/>
  <Pressable style={s.row} onPress={()=>navigation.navigate("GroupInfo",{conversationId:route.params.conversationId})}><GroupActionIcon kind="members"/><View style={{flex:1}}><Text style={s.rowTitle}>Edit group admins</Text><Text style={s.rowDesc}>Choose which members can manage the group.</Text></View><Text style={s.chevron}>›</Text></Pressable>
  <Pressable style={s.row} onPress={()=>navigation.navigate("GroupInvite",{conversationId:route.params.conversationId})}><GroupActionIcon kind="link"/><View style={{flex:1}}><Text style={s.rowTitle}>Manage group invite</Text><Text style={s.rowDesc}>Copy, share, view QR code, or reset the current link.</Text></View><Text style={s.chevron}>›</Text></Pressable>
 </ScrollView></SafeAreaView>;
}
function Permission({icon,title,description,value,enabled,onChange}:{icon:any;title:string;description:string;value:boolean;enabled:boolean;onChange:(v:boolean)=>void}){return <View style={s.row}><GroupActionIcon kind={icon}/><View style={{flex:1}}><Text style={s.rowTitle}>{title}</Text><Text style={s.rowDesc}>{description}</Text></View><Switch disabled={!enabled} value={value} onValueChange={onChange} trackColor={{false:"#D0D5DD",true:"#22A96B"}} thumbColor="#FFF"/></View>}
const s=StyleSheet.create({root:{flex:1,backgroundColor:"#F7F8FA"},header:{height:64,backgroundColor:"#FFF",borderBottomWidth:1,borderBottomColor:"#E5E7EB",paddingHorizontal:16,flexDirection:"row",alignItems:"center",gap:14},title:{fontSize:20,fontWeight:"700",color:"#111827"},subtitle:{fontSize:13,color:"#667085",marginTop:2},content:{paddingBottom:40},section:{fontSize:15,color:"#667085",paddingHorizontal:22,paddingTop:24,paddingBottom:8},row:{minHeight:78,backgroundColor:"#FFF",paddingHorizontal:22,paddingVertical:12,flexDirection:"row",alignItems:"center",gap:18,borderBottomWidth:1,borderBottomColor:"#F0F2F5"},rowTitle:{fontSize:17,color:"#101828"},rowDesc:{fontSize:13,color:"#667085",lineHeight:18,marginTop:3},chevron:{fontSize:28,color:"#98A2B3"},error:{padding:24,color:"#B42318"}});