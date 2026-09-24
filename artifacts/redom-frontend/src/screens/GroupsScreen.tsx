import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { messageService, type ConversationSummary } from "../messages/messageService";
import { GroupActionIcon } from "../components/GroupActionIcon";

type DiscoverGroup = { id:string; groupName:string|null; groupDescription:string|null; groupPhoto:string|null; participantCount:number; joinApprovalRequired:boolean; verified:boolean };

export function GroupsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [groups,setGroups]=useState<DiscoverGroup[]>([]);
  const [joined,setJoined]=useState<ConversationSummary[]>([]);
  const [dismissed,setDismissed]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [query,setQuery]=useState("");
  const [createOpen,setCreateOpen]=useState(false);

  const load=useCallback(async(refresh=false)=>{
    refresh?setRefreshing(true):setLoading(true);
    try{
      const [discover,inbox]=await Promise.all([messageService.discoverGroups(query.trim()||undefined),messageService.listConversations()]);
      setGroups(discover.groups??[]);
      setJoined((inbox.conversations??[]).filter(c=>c.type==="group"));
    }catch(e){Alert.alert("Groups",e instanceof Error?e.message:"Groups could not be loaded.");}
    finally{setLoading(false);setRefreshing(false);}
  },[query]);

  useEffect(()=>{const t=setTimeout(()=>void load(),query?250:0);return()=>clearTimeout(t)},[load]);
  const visibleGroups=useMemo(()=>groups.filter(g=>!dismissed.includes(g.id)),[groups,dismissed]);

  const join=async(group:DiscoverGroup)=>{
    try{
      const result=await messageService.joinDiscoveredGroup(group.id);
      if(result.pending) Alert.alert("Join request sent",(group.groupName||"This group")+" requires admin approval.");
      else Alert.alert("Joined","You joined "+(group.groupName||"this group")+".");
      setDismissed(v=>[...v,group.id]);
      if(!result.pending) navigation.navigate("Chat",{conversationId:group.id});
    }catch(e){Alert.alert("Join group",e instanceof Error?e.message:"Unable to join this group.");}
  };

  return <SafeAreaView style={s.root}>
    <View style={s.header}>
      <Pressable onPress={()=>navigation.goBack()} hitSlop={8}><GroupActionIcon kind="back" size={30} color="#111"/></Pressable>
      {searchOpen?<TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search groups" style={s.search}/>:<Text style={s.title}>Groups</Text>}
      <View style={s.headerActions}>
        <Pressable onPress={()=>setCreateOpen(true)} hitSlop={7}><GroupActionIcon kind="add" size={31} color="#111"/></Pressable>
        <Pressable onPress={()=>Alert.alert("Your groups",joined.length?joined.map(g=>g.groupName||"ReDom group").join("\n"):"You haven't joined any groups yet.")} hitSlop={7}><GroupActionIcon kind="members" size={31} color="#111"/></Pressable>
        <Pressable onPress={()=>setSearchOpen(v=>!v)} hitSlop={7}><GroupActionIcon kind="search" size={31} color="#111"/></Pressable>
      </View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}><View style={s.activeTab}><Text style={s.activeTabText}>Discover</Text></View></ScrollView>
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)}/>} contentContainerStyle={s.content}>
      <Text style={s.sectionTitle}>Suggested for you</Text>
      {loading?<ActivityIndicator size="large" color="#1877F2" style={{marginTop:40}}/>:
      visibleGroups.length?<View style={s.grid}>{visibleGroups.map(group=><View key={group.id} style={s.card}>
        <View style={s.imageWrap}>{group.groupPhoto?<Image source={{uri:group.groupPhoto}} style={s.cover}/>:<View style={s.coverFallback}><GroupActionIcon kind="members" size={58} color="#1877F2"/></View>}<Pressable onPress={()=>setDismissed(v=>[...v,group.id])} style={s.dismiss}><GroupActionIcon kind="close" size={22} color="#FFF"/></Pressable></View>
        <View style={s.cardBody}><Text style={s.groupName} numberOfLines={2}>{group.groupName||"ReDom group"}</Text><Text style={s.meta}>{group.joinApprovalRequired?"Private group · ":"Public group · "}{group.participantCount.toLocaleString()} members</Text><Pressable onPress={()=>void join(group)} style={s.join}><Text style={s.joinText}>Join</Text></Pressable></View>
      </View>)}</View>:
      <View style={s.empty}><GroupActionIcon kind="members" size={62} color="#1877F2"/><Text style={s.emptyTitle}>No groups to discover yet</Text><Text style={s.emptyText}>{query.trim()?"Try a different group search.":"Public ReDom groups will appear here when available."}</Text></View>}
    </ScrollView>

    <Modal visible={createOpen} transparent animationType="slide" onRequestClose={()=>setCreateOpen(false)}>
      <Pressable style={s.modalBackdrop} onPress={()=>setCreateOpen(false)}/>
      <View style={s.sheet}><View style={s.handle}/><Pressable style={s.sheetRow} onPress={()=>{setCreateOpen(false);Alert.alert("Create a post","Choose a group you've joined to publish a group post. The group-post composer will be connected here.");}}><View style={s.sheetIcon}><GroupActionIcon kind="edit" size={28} color="#111"/></View><View><Text style={s.sheetTitle}>Create a post</Text><Text style={s.sheetSub}>Post in a group you've joined.</Text></View></Pressable><Pressable style={s.sheetRow} onPress={()=>{setCreateOpen(false);navigation.navigate("CreateGroup");}}><View style={s.sheetIcon}><GroupActionIcon kind="members" size={28} color="#111"/></View><View><Text style={s.sheetTitle}>Create a group</Text><Text style={s.sheetSub}>Create a public or private group.</Text></View></Pressable></View>
    </Modal>
  </SafeAreaView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:"#FFF"},header:{height:64,borderBottomWidth:1,borderBottomColor:"#E4E6EB",flexDirection:"row",alignItems:"center",paddingHorizontal:16},title:{flex:1,textAlign:"center",fontSize:22,fontWeight:"800",color:"#050505"},search:{flex:1,marginHorizontal:12,fontSize:17},headerActions:{flexDirection:"row",alignItems:"center",gap:18,marginLeft:"auto"},tabs:{paddingHorizontal:22,paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#E4E6EB"},activeTab:{paddingHorizontal:22,paddingVertical:10,borderRadius:24,backgroundColor:"#E5F1FF"},activeTabText:{fontSize:17,fontWeight:"700",color:"#1877F2"},content:{padding:22,paddingBottom:60},sectionTitle:{fontSize:28,fontWeight:"800",color:"#050505",marginBottom:24},grid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between"},card:{width:"48.5%",borderWidth:1,borderColor:"#DADDE1",borderRadius:12,overflow:"hidden",marginBottom:18,backgroundColor:"#FFF"},imageWrap:{height:185,backgroundColor:"#EEF2F6"},cover:{width:"100%",height:"100%"},coverFallback:{flex:1,alignItems:"center",justifyContent:"center"},dismiss:{position:"absolute",right:10,top:10,width:42,height:42,borderRadius:21,backgroundColor:"rgba(70,70,70,.72)",alignItems:"center",justifyContent:"center"},cardBody:{padding:14},groupName:{fontSize:20,fontWeight:"800",color:"#050505",minHeight:48},meta:{fontSize:16,color:"#65676B",lineHeight:22,minHeight:44,marginTop:4},join:{height:48,borderRadius:10,backgroundColor:"#1877F2",alignItems:"center",justifyContent:"center",marginTop:12},joinText:{fontSize:18,fontWeight:"800",color:"#FFF"},empty:{alignItems:"center",paddingTop:110,paddingHorizontal:35},emptyTitle:{fontSize:22,fontWeight:"800",marginTop:18,color:"#050505",textAlign:"center"},emptyText:{fontSize:16,color:"#65676B",textAlign:"center",marginTop:8,lineHeight:23},modalBackdrop:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(0,0,0,.42)"},sheet:{position:"absolute",left:0,right:0,bottom:0,backgroundColor:"#FFF",borderTopLeftRadius:26,borderTopRightRadius:26,paddingHorizontal:22,paddingTop:10,paddingBottom:34},handle:{width:76,height:6,borderRadius:3,backgroundColor:"#8A8D91",alignSelf:"center",marginBottom:10},sheetRow:{flexDirection:"row",alignItems:"center",paddingVertical:18,gap:18},sheetIcon:{width:58,height:58,borderRadius:29,backgroundColor:"#EEF0F3",alignItems:"center",justifyContent:"center"},sheetTitle:{fontSize:19,fontWeight:"800",color:"#050505"},sheetSub:{fontSize:15,color:"#65676B",marginTop:4}});
