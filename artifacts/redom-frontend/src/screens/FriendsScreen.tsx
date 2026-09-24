import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { useAuthContext } from "../auth/context";
import { friendsService, type FriendPerson } from "../friends/friendsService";
import { messageService } from "../messages/messageService";
import FriendAddIcon from "../assets/home-feed/friend-add.svg";
import FriendRemoveIcon from "../assets/home-feed/friend-remove.svg";
import FriendMessageIcon from "../assets/home-feed/friend-message.svg";
import FriendMoreIcon from "../assets/home-feed/friend-more.svg";
import FriendFollowingIcon from "../assets/home-feed/friend-following.svg";
import FriendCommonIcon from "../assets/home-feed/friend-common.svg";
import FriendSearchIcon from "../assets/home-feed/friend-search.svg";
import BackIcon from "../assets/navigation/back.svg";

type Tab="friends"|"following"|"suggested"|"common";
type ActionTarget={person:FriendPerson;tab:Tab};

export function FriendsScreen(){
 const navigation=useNavigation<NativeStackNavigationProp<RootStackParamList>>();
 const route=useRoute<any>();
 const viewedUserId:string|undefined=route.params?.userId;
 const viewedName:string|undefined=route.params?.displayName;
 const {user}=useAuthContext();
 const [tab,setTab]=useState<Tab>(viewedUserId?"suggested":"friends");
 const [query,setQuery]=useState("");
 const [people,setPeople]=useState<FriendPerson[]>([]);
 const [incoming,setIncoming]=useState<FriendPerson[]>([]);
 const [loading,setLoading]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [action,setAction]=useState<ActionTarget|null>(null);
 const [requestIds,setRequestIds]=useState<Record<string,string>>({});

 const load=useCallback(async(refresh=false)=>{
   refresh?setRefreshing(true):setLoading(true);
   try{
     const result=viewedUserId?(tab==="suggested"?await friendsService.suggested(query.trim()||undefined):await friendsService.profileFriends(viewedUserId,tab==="common"?"mutual":"all")):tab==="friends"?await friendsService.list(query.trim()||undefined):tab==="following"?await friendsService.following():tab==="suggested"?await friendsService.suggested(query.trim()||undefined):await friendsService.common();
     setPeople(result.people??[]);
     if(!viewedUserId&&tab==="friends"){const req=await friendsService.requests();setIncoming(req.incoming??[]);const ids:Record<string,string>={};for(const p of req.incoming??[])if(p.incomingRequestId)ids[p.userId]=p.incomingRequestId;setRequestIds(ids);}
   }catch(e){Alert.alert("Friends",e instanceof Error?e.message:"Friends could not be loaded.");}
   finally{setLoading(false);setRefreshing(false);}
 },[tab,query]);

 useEffect(()=>{const t=setTimeout(()=>void load(),query?250:0);return()=>clearTimeout(t)},[load]);

 const tabs=useMemo(()=>viewedUserId?[["suggested","Suggestions"],["common","Mutual"],["friends","All"]] as const:[["friends","Friends"],["following","Following"],["suggested","Suggested"],["common","Things in common"]] as const,[viewedUserId]);

 const add=async(p:FriendPerson)=>{try{const r=await friendsService.add(p.userId);setPeople(v=>v.map(x=>x.userId===p.userId?{...x,requestSent:true,outgoingRequestId:r.requestId}:x));}catch(e){Alert.alert("Add friend",e instanceof Error?e.message:"Friend request could not be sent.");}};
 const cancel=async(p:FriendPerson)=>{try{await friendsService.cancel(p.userId);setPeople(v=>v.map(x=>x.userId===p.userId?{...x,requestSent:false,outgoingRequestId:null}:x));}catch(e){Alert.alert("Cancel request",e instanceof Error?e.message:"Request could not be cancelled.");}};
 const accept=async(p:FriendPerson)=>{const id=p.incomingRequestId||requestIds[p.userId];if(!id)return;try{await friendsService.accept(id);setIncoming(v=>v.filter(x=>x.userId!==p.userId));if(tab==="friends")void load(true);}catch(e){Alert.alert("Friend request",e instanceof Error?e.message:"Request could not be accepted.");}};
 const decline=async(p:FriendPerson)=>{const id=p.incomingRequestId||requestIds[p.userId];if(!id)return;try{await friendsService.decline(id);setIncoming(v=>v.filter(x=>x.userId!==p.userId));}catch(e){Alert.alert("Friend request",e instanceof Error?e.message:"Request could not be declined.");}};
 const message=async(p:FriendPerson)=>{try{const r=await messageService.createDirect(p.profileId);navigation.navigate("Chat",{conversationId:r.conversationId});}catch(e){Alert.alert("Message",e instanceof Error?e.message:"Chat could not be opened.");}};
 const unfriend=async(p:FriendPerson)=>{Alert.alert("Unfriend "+p.firstName+"?","This will remove the friendship. You can send a new friend request later.",[{text:"Cancel",style:"cancel"},{text:"Unfriend",style:"destructive",onPress:async()=>{try{await friendsService.unfriend(p.userId);setPeople(v=>v.filter(x=>x.userId!==p.userId));}catch(e){Alert.alert("Unfriend",e instanceof Error?e.message:"Unable to unfriend.");}}}]);};
 const unfollow=async(p:FriendPerson)=>{try{await friendsService.unfollow(p.userId);setPeople(v=>v.filter(x=>x.userId!==p.userId));}catch(e){Alert.alert("Unfollow",e instanceof Error?e.message:"Unable to unfollow.");}};
 const block=async(p:FriendPerson)=>{Alert.alert("Block "+p.firstName+"?","They won't be able to see or contact you on ReDom.",[{text:"Cancel",style:"cancel"},{text:"Block",style:"destructive",onPress:async()=>{try{await friendsService.block(p.userId);setPeople(v=>v.filter(x=>x.userId!==p.userId));}catch(e){Alert.alert("Block",e instanceof Error?e.message:"Unable to block.");}}}]);};

 const renderPerson=(p:FriendPerson)=>{
   const pending=p.requestSent;
   return <View key={p.userId} style={s.person}>
     <Pressable style={s.identity} onPress={()=>navigation.navigate("Profile",{userId:p.userId})}>
       {p.profilePhoto?<Image source={{uri:p.profilePhoto}} style={s.avatar}/>:<View style={s.avatarFallback}><Text style={s.initial}>{(p.firstName?.[0]||"?").toUpperCase()}</Text></View>}
       <View style={s.nameWrap}><Text style={s.name} numberOfLines={2}>{p.firstName} {p.lastName}</Text>{tab==="common"&&<Text style={s.sub}>{p.currentCity?"Lives in "+p.currentCity:p.hometown?"From "+p.hometown:"You have things in common"}</Text>}{p.verified?<Text style={s.verified}>Verified</Text>:null}{pending?<Text style={s.sub}>Request sent</Text>:null}</View>
     </Pressable>
     {viewedUserId ? null : tab==="suggested"||tab==="common" ? <View style={s.actionPair}><Pressable style={s.primaryBtn} onPress={()=>pending?void cancel(p):void add(p)}><Text style={s.primaryText}>{pending?"Cancel request":"Add friend"}</Text></Pressable><Pressable style={s.secondaryBtn} onPress={()=>setPeople(v=>v.filter(x=>x.userId!==p.userId))}><Text style={s.secondaryText}>Remove</Text></Pressable></View> : <Pressable style={s.moreBtn} onPress={()=>setAction({person:p,tab})}><FriendMoreIcon width={30} height={30}/></Pressable>}
   </View>;
 };

 return <SafeAreaView style={s.root}>
  <View style={s.header}><Pressable onPress={()=>navigation.goBack()} hitSlop={8}><BackIcon width={30} height={30}/></Pressable><Text style={s.headerTitle}>{viewedName||((user?user.firstName+" "+user.lastName:"Friends"))}</Text><View style={s.headerSearch}/></View>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>{tabs.map(([id,label])=><Pressable key={id} onPress={()=>setTab(id)} style={[s.tab,tab===id&&s.activeTab]}><Text style={[s.tabText,tab===id&&s.activeTabText]}>{label}</Text></Pressable>)}</ScrollView>
  <View style={s.searchBox}><FriendSearchIcon width={27} height={27}/><TextInput value={query} onChangeText={setQuery} placeholder="Search friends" placeholderTextColor="#667085" style={s.searchInput}/></View>
  <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)}/>} contentContainerStyle={s.content}>
   {!viewedUserId&&tab==="friends"&&incoming.length>0?<View style={s.requests}><Text style={s.sectionTitle}>Friend requests</Text>{incoming.slice(0,5).map(p=><View key={p.userId} style={s.requestRow}><View style={s.identity}>{p.profilePhoto?<Image source={{uri:p.profilePhoto}} style={s.avatar}/>:<View style={s.avatarFallback}><Text style={s.initial}>{p.firstName?.[0]}</Text></View>}<View style={s.nameWrap}><Text style={s.name}>{p.firstName} {p.lastName}</Text><Text style={s.sub}>Wants to be your friend</Text></View></View><View style={s.requestActions}><Pressable style={s.primaryBtn} onPress={()=>void accept(p)}><Text style={s.primaryText}>Confirm</Text></Pressable><Pressable style={s.secondaryBtn} onPress={()=>void decline(p)}><Text style={s.secondaryText}>Delete</Text></Pressable></View></View>)}</View>:null}
   <Text style={s.sectionTitle}>{viewedUserId?(tab==="suggested"?"Suggestions":tab==="common"?"Mutual":"All friends"):tab==="friends"?"Friends":tab==="following"?(people.length+" following"):tab==="suggested"?"People you may know":"Things in common"}</Text>
   {loading?<ActivityIndicator size="large" color="#1877F2" style={{marginTop:40}}/>:people.length?people.map(renderPerson):<View style={s.empty}>{tab==="common"?<FriendCommonIcon width={90} height={90}/>:<FriendAddIcon width={90} height={90}/>}<Text style={s.emptyTitle}>{tab==="common"?"No friends with things in common?":"No friends to show"}</Text><Text style={s.emptyText}>{tab==="common"?"Add interests to your profile and ReDom will show relevant connections here.":"Use Suggested to find people you may know."}</Text></View>}
  </ScrollView>
  <Modal visible={!!action} transparent animationType="slide" onRequestClose={()=>setAction(null)}>
   <Pressable style={s.backdrop} onPress={()=>setAction(null)}/><View style={s.sheet}><View style={s.handle}/>{action?<><View style={s.sheetPerson}>{action.person.profilePhoto?<Image source={{uri:action.person.profilePhoto}} style={s.sheetAvatar}/>:<View style={s.sheetAvatarFallback}><Text style={s.initial}>{action.person.firstName?.[0]}</Text></View>}<View><Text style={s.sheetName}>{action.person.firstName} {action.person.lastName}</Text><Text style={s.sub}>{action.person.currentCity||"ReDom"}</Text></View></View>{action.tab==="friends"?<><Pressable style={s.sheetRow} onPress={()=>{setAction(null);navigation.navigate("Friends",{userId:action.person.userId,displayName:action.person.firstName+" "+action.person.lastName})}}><FriendCommonIcon width={32} height={32}/><Text style={s.sheetText}>See {action.person.firstName}&#39;s friends</Text></Pressable><Pressable style={s.sheetRow} onPress={()=>{setAction(null);void message(action.person)}}><FriendMessageIcon width={32} height={32}/><Text style={s.sheetText}>Message {action.person.firstName} {action.person.lastName}</Text></Pressable><Pressable style={s.sheetRow} onPress={()=>{setAction(null);void unfriend(action.person)}}><FriendRemoveIcon width={32} height={32}/><Text style={s.sheetText}>Unfriend {action.person.firstName} {action.person.lastName}</Text></Pressable><Pressable style={s.sheetRow} onPress={()=>{setAction(null);void unfollow(action.person)}}><FriendFollowingIcon width={32} height={32}/><Text style={s.sheetText}>Unfollow {action.person.firstName} {action.person.lastName}</Text></Pressable><Pressable style={s.sheetRow} onPress={()=>{setAction(null);void block(action.person)}}><FriendRemoveIcon width={32} height={32}/><Text style={s.sheetText}>Block {action.person.firstName}'s profile</Text></Pressable></>:<Pressable style={s.sheetRow} onPress={()=>{setAction(null);void unfollow(action.person)}}><FriendFollowingIcon width={32} height={32}/><Text style={s.sheetText}>Unfollow {action.person.firstName} {action.person.lastName}</Text></Pressable>}</>:null}</View>
  </Modal>
 </SafeAreaView>;
}
const s=StyleSheet.create({
root:{flex:1,backgroundColor:"#FFF"},header:{height:64,borderBottomWidth:1,borderBottomColor:"#E4E6EB",flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:18},headerTitle:{fontSize:22,fontWeight:"800",color:"#111"},headerSearch:{width:30,height:30},tabs:{paddingHorizontal:22,paddingVertical:14,gap:10},tab:{paddingHorizontal:20,paddingVertical:10,borderRadius:24,backgroundColor:"#E4E6EB"},activeTab:{backgroundColor:"#E5F0FF"},tabText:{fontSize:17,fontWeight:"700",color:"#111"},activeTabText:{color:"#1877F2"},searchBox:{marginHorizontal:24,marginBottom:18,height:54,borderRadius:28,backgroundColor:"#F0F2F5",flexDirection:"row",alignItems:"center",paddingHorizontal:14},searchInput:{flex:1,fontSize:17,paddingHorizontal:7,color:"#111"},content:{paddingHorizontal:22,paddingBottom:40},sectionTitle:{fontSize:28,fontWeight:"800",color:"#111",marginVertical:14},person:{minHeight:88,flexDirection:"row",alignItems:"center",paddingVertical:8},identity:{flex:1,flexDirection:"row",alignItems:"center",minWidth:0},avatar:{width:66,height:66,borderRadius:33,backgroundColor:"#E5E7EB"},avatarFallback:{width:66,height:66,borderRadius:33,backgroundColor:"#E5F0FF",alignItems:"center",justifyContent:"center"},initial:{fontSize:25,fontWeight:"800",color:"#1877F2"},nameWrap:{flex:1,paddingHorizontal:12},name:{fontSize:19,fontWeight:"700",color:"#111",lineHeight:23},sub:{fontSize:15,color:"#667085",marginTop:2},verified:{fontSize:13,color:"#1877F2",fontWeight:"700",marginTop:2},moreBtn:{width:48,height:48,borderRadius:24,alignItems:"center",justifyContent:"center"},actionPair:{width:238,flexDirection:"row",gap:8},primaryBtn:{flex:1,minHeight:48,borderRadius:10,backgroundColor:"#1877F2",alignItems:"center",justifyContent:"center",paddingHorizontal:10},primaryText:{fontSize:15,fontWeight:"800",color:"#FFF"},secondaryBtn:{flex:1,minHeight:48,borderRadius:10,backgroundColor:"#E4E6EB",alignItems:"center",justifyContent:"center",paddingHorizontal:10},secondaryText:{fontSize:15,fontWeight:"800",color:"#111"},requests:{marginBottom:8},requestRow:{paddingVertical:8},requestActions:{flexDirection:"row",gap:10,marginLeft:78,marginTop:-4},empty:{alignItems:"center",paddingTop:90,paddingHorizontal:30},emptyTitle:{fontSize:24,fontWeight:"800",textAlign:"center",marginTop:15,color:"#111"},emptyText:{fontSize:16,color:"#667085",textAlign:"center",lineHeight:23,marginTop:8},backdrop:{flex:1,backgroundColor:"rgba(0,0,0,.38)"},sheet:{backgroundColor:"#FFF",borderTopLeftRadius:26,borderTopRightRadius:26,paddingTop:12,paddingBottom:28},handle:{width:74,height:6,borderRadius:3,backgroundColor:"#8B8F95",alignSelf:"center",marginBottom:15},sheetPerson:{flexDirection:"row",alignItems:"center",paddingHorizontal:24,paddingBottom:14},sheetAvatar:{width:58,height:58,borderRadius:29},sheetAvatarFallback:{width:58,height:58,borderRadius:29,backgroundColor:"#E5F0FF",alignItems:"center",justifyContent:"center"},sheetName:{fontSize:20,fontWeight:"800",color:"#111",marginLeft:14},sheetRow:{minHeight:64,paddingHorizontal:24,flexDirection:"row",alignItems:"center",gap:18},sheetText:{fontSize:18,fontWeight:"700",color:"#111"}
});