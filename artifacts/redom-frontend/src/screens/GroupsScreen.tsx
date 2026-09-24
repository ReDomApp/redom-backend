import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { publicGroupService, type PublicGroup } from "../groups/publicGroupService";
import { GroupActionIcon } from "../components/GroupActionIcon";

type DiscoverGroup = PublicGroup;

export function GroupsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [groups,setGroups]=useState<DiscoverGroup[]>([]);
  const [joined,setJoined]=useState<PublicGroup[]>([]);
  const [dismissed,setDismissed]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [query,setQuery]=useState("");
  const [createOpen,setCreateOpen]=useState(false);
  const [yourGroupsOpen,setYourGroupsOpen]=useState(false);

  const load=useCallback(async(refresh=false)=>{
    refresh?setRefreshing(true):setLoading(true);
    try{
      const [discover,mine]=await Promise.all([publicGroupService.discover(query.trim()||undefined),publicGroupService.mine()]);
      setGroups(discover.groups??[]);
      setJoined(mine.groups??[]);
    }catch(e){Alert.alert("Groups",e instanceof Error?e.message:"Groups could not be loaded.");}
    finally{setLoading(false);setRefreshing(false);}
  },[query]);

  useEffect(()=>{const t=setTimeout(()=>void load(),query?250:0);return()=>clearTimeout(t)},[load]);
  const visibleGroups=useMemo(()=>groups.filter(g=>!dismissed.includes(g.id)),[groups,dismissed]);

  const join=async(group:DiscoverGroup)=>{
    try{
      const result=await publicGroupService.join(group.id);
      if(result.pending) Alert.alert("Join request sent",(group.name||"This group")+" requires admin approval.");
      else Alert.alert("Joined","You joined "+(group.name||"this group")+".");
      setDismissed(v=>[...v,group.id]);
      if(!result.pending) setJoined(v=>[...v,{...group,role:"member"}]);
    }catch(e){Alert.alert("Join group",e instanceof Error?e.message:"Unable to join this group.");}
  };

  return <SafeAreaView style={s.root}>
    <View style={s.header}>
      <Pressable onPress={()=>navigation.goBack()} hitSlop={8}><GroupActionIcon kind="back" size={30} color="#111"/></Pressable>
      {searchOpen?<TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search groups" style={s.search}/>:<Text style={s.title}>Groups</Text>}
      <View style={s.headerActions}>
        <Pressable onPress={()=>setCreateOpen(true)} hitSlop={7}><GroupActionIcon kind="add" size={31} color="#111"/></Pressable>
        <Pressable onPress={()=>setYourGroupsOpen(true)} hitSlop={7}><GroupActionIcon kind="members" size={31} color="#111"/></Pressable>
        <Pressable onPress={()=>setSearchOpen(v=>!v)} hitSlop={7}><GroupActionIcon kind="search" size={31} color="#111"/></Pressable>
      </View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}><View style={s.activeTab}><Text style={s.activeTabText}>Discover</Text></View></ScrollView>
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)}/>} contentContainerStyle={s.content}>
      <Text style={s.sectionTitle}>Suggested for you</Text>
      {loading?<ActivityIndicator size="large" color="#1877F2" style={{marginTop:40}}/>:
      visibleGroups.length?<View style={s.grid}>{visibleGroups.map(group=><View key={group.id} style={s.card}>
        <View style={s.imageWrap}>{group.groupPhoto?<Image source={{uri:group.groupPhoto}} style={s.cover}/>:<View style={s.coverFallback}><GroupActionIcon kind="members" size={58} color="#1877F2"/></View>}<Pressable onPress={()=>setDismissed(v=>[...v,group.id])} style={s.dismiss}><GroupActionIcon kind="close" size={22} color="#FFF"/></Pressable></View>
        <View style={s.cardBody}><Text style={s.groupName} numberOfLines={2}>{group.name||"ReDom group"}</Text><Text style={s.meta}>{group.memberApprovalRequired?"Public group · Approval required · ":"Public group · "}{group.memberCount.toLocaleString()} members</Text><Pressable onPress={()=>void join(group)} style={s.join}><Text style={s.joinText}>Join</Text></Pressable></View>
      </View>)}</View>:
      <View style={s.empty}><GroupActionIcon kind="members" size={62} color="#1877F2"/><Text style={s.emptyTitle}>No groups to discover yet</Text><Text style={s.emptyText}>{query.trim()?"Try a different group search.":"Public ReDom groups will appear here when available."}</Text></View>}
    </ScrollView>

    <Modal visible={yourGroupsOpen} transparent animationType="slide" onRequestClose={()=>setYourGroupsOpen(false)}><Pressable style={s.modalBackdrop} onPress={()=>setYourGroupsOpen(false)}/><View style={s.sheet}><View style={s.handle}/><Text style={s.yourTitle}>Your groups</Text>{joined.length?joined.map(group=><Pressable key={group.id} style={s.yourRow} onPress={()=>{setYourGroupsOpen(false);Alert.alert(group.name||"ReDom group",group.description||"You are a member of this public group.");}}><View style={s.yourIcon}><GroupActionIcon kind="members" size={25} color="#1877F2"/></View><Text style={s.yourName} numberOfLines={1}>{group.name||"ReDom group"}</Text><GroupActionIcon kind="chevron" size={22} color="#667085"/></Pressable>):<Text style={s.yourEmpty}>You haven't joined any groups yet.</Text>}</View></Modal>
    <Modal visible={createOpen} transparent animationType="slide" onRequestClose={()=>setCreateOpen(false)}>
      <Pressable style={s.modalBackdrop} onPress={()=>setCreateOpen(false)}/>
      <View style={s.sheet}><View style={s.handle}/><Pressable style={s.sheetRow} onPress={()=>{setCreateOpen(false);Alert.alert("Create a post","Choose a group you've joined to publish a group post. The group-post composer will be connected here.");}}><View style={s.sheetIcon}><GroupActionIcon kind="edit" size={28} color="#111"/></View><View><Text style={s.sheetTitle}>Create a post</Text><Text style={s.sheetSub}>Post in a group you've joined.</Text></View></Pressable><Pressable style={s.sheetRow} onPress={()=>{setCreateOpen(false);navigation.navigate("CreatePublicGroup");}}><View style={s.sheetIcon}><GroupActionIcon kind="members" size={28} color="#111"/></View><View><Text style={s.sheetTitle}>Create a group</Text><Text style={s.sheetSub}>Create a public or private group.</Text></View></Pressable></View>
    </Modal>
  </SafeAreaView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor: colors.surface},header:{height:64,borderBottomWidth:1,borderBottomColor: colors.border,flexDirection:"row",alignItems:"center",paddingHorizontal:16},title:{flex:1,textAlign:"center",fontSize:22,fontWeight:"800",color: colors.text},search:{flex:1,marginHorizontal:12,fontSize:17},headerActions:{flexDirection:"row",alignItems:"center",gap:18,marginLeft:"auto"},tabs:{paddingHorizontal:22,paddingVertical:10,borderBottomWidth:1,borderBottomColor: colors.border},activeTab:{paddingHorizontal:22,paddingVertical:10,borderRadius:24,backgroundColor: colors.surfaceSecondary},activeTabText:{fontSize:17,fontWeight:"700",color:"#1877F2"},content:{padding:22,paddingBottom:60},sectionTitle:{fontSize:28,fontWeight:"800",color: colors.text,marginBottom:24},grid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between"},card:{width:"48.5%",borderWidth:1,borderColor: colors.border,borderRadius:12,overflow:"hidden",marginBottom:18,backgroundColor: colors.surface},imageWrap:{height:185,backgroundColor: colors.surfaceSecondary},cover:{width:"100%",height:"100%"},coverFallback:{flex:1,alignItems:"center",justifyContent:"center"},dismiss:{position:"absolute",right:10,top:10,width:42,height:42,borderRadius:21,backgroundColor:"rgba(70,70,70,.72)",alignItems:"center",justifyContent:"center"},cardBody:{padding:14},groupName:{fontSize:20,fontWeight:"800",color: colors.text,minHeight:48},meta:{fontSize:16,color: colors.textSecondary,lineHeight:22,minHeight:44,marginTop:4},join:{height:48,borderRadius:10,backgroundColor:"#1877F2",alignItems:"center",justifyContent:"center",marginTop:12},joinText:{fontSize:18,fontWeight:"800",color:"#FFF"},empty:{alignItems:"center",paddingTop:110,paddingHorizontal:35},emptyTitle:{fontSize:22,fontWeight:"800",marginTop:18,color: colors.text,textAlign:"center"},emptyText:{fontSize:16,color: colors.textSecondary,textAlign:"center",marginTop:8,lineHeight:23},modalBackdrop:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(0,0,0,.42)"},sheet:{position:"absolute",left:0,right:0,bottom:0,backgroundColor: colors.surface,borderTopLeftRadius:26,borderTopRightRadius:26,paddingHorizontal:22,paddingTop:10,paddingBottom:34},handle:{width:76,height:6,borderRadius:3,backgroundColor:"#8A8D91",alignSelf:"center",marginBottom:10},yourTitle:{fontSize:22,fontWeight:"800",color: colors.text,paddingHorizontal:4,paddingBottom:8},yourRow:{minHeight:64,flexDirection:"row",alignItems:"center",gap:14,borderTopWidth:1,borderTopColor: colors.border},yourIcon:{width:46,height:46,borderRadius:23,backgroundColor: colors.surfaceSecondary,alignItems:"center",justifyContent:"center"},yourName:{flex:1,fontSize:17,fontWeight:"600",color: colors.text},yourEmpty:{fontSize:16,color: colors.textSecondary,paddingVertical:28,textAlign:"center"},sheetRow:{flexDirection:"row",alignItems:"center",paddingVertical:18,gap:18},sheetIcon:{width:58,height:58,borderRadius:29,backgroundColor: colors.surfaceSecondary,alignItems:"center",justifyContent:"center"},sheetTitle:{fontSize:19,fontWeight:"800",color: colors.text},sheetSub:{fontSize:15,color: colors.textSecondary,marginTop:4}}); }

