import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { publicGroupService } from "../groups/publicGroupService";
import { GroupActionIcon } from "../components/GroupActionIcon";

export function CreatePublicGroupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [name,setName]=useState("");
  const [description,setDescription]=useState("");
  const [approval,setApproval]=useState(false);
  const [saving,setSaving]=useState(false);

  const create=async()=>{
    if(!name.trim()) return Alert.alert("Create a group","Enter a group name.");
    setSaving(true);
    try{
      const result=await publicGroupService.create({name:name.trim(),description:description.trim()||undefined,memberApprovalRequired:approval});
      Alert.alert("Group created","Your public ReDom group is now available in Groups.",[{text:"Done",onPress:()=>navigation.goBack()}]);
      void result;
    }catch(e){Alert.alert("Create a group",e instanceof Error?e.message:"The public group could not be created.");}
    finally{setSaving(false);}
  };

  return <SafeAreaView style={s.root}>
    <View style={s.header}><Pressable onPress={()=>navigation.goBack()}><GroupActionIcon kind="back" size={30} color="#111"/></Pressable><Text style={s.title}>Create a group</Text><Pressable disabled={saving} onPress={()=>void create()} style={s.check}>{saving?<ActivityIndicator color="#FFF"/>:<GroupActionIcon kind="check" size={25} color="#FFF" />}</Pressable></View>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.hero}><View style={s.icon}><GroupActionIcon kind="members" size={48} color="#1877F2"/></View><Text style={s.heroTitle}>Public ReDom group</Text><Text style={s.heroText}>This is a public social group. People can discover it even when they are not your friends.</Text></View>
      <Text style={s.label}>Group name</Text><TextInput value={name} onChangeText={setName} placeholder="Group name" style={s.input} maxLength={150}/>
      <Text style={s.label}>Description</Text><TextInput value={description} onChangeText={setDescription} placeholder="What is this group about?" style={[s.input,s.multiline]} multiline maxLength={5000}/>
      <Pressable style={s.option} onPress={()=>setApproval(v=>!v)}><GroupActionIcon kind="approval" size={27} color="#667085"/><View style={{flex:1}}><Text style={s.optionTitle}>Approve new members</Text><Text style={s.optionText}>{approval?"On · members wait for approval":"Off · people can join immediately"}</Text></View><GroupActionIcon kind={approval?"check":"chevron"} size={22} color="#1877F2"/></Pressable>
    </ScrollView>
  </SafeAreaView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:"#F5F6F7"},header:{height:64,backgroundColor:"#FFF",paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderBottomWidth:1,borderBottomColor:"#E5E7EB"},title:{fontSize:20,fontWeight:"700",color:"#111827"},check:{width:44,height:44,borderRadius:13,backgroundColor:"#111",alignItems:"center",justifyContent:"center"},content:{padding:22,paddingBottom:50},hero:{backgroundColor:"#FFF",borderRadius:16,padding:24,alignItems:"center",marginBottom:24},icon:{width:88,height:88,borderRadius:44,backgroundColor:"#E8F1FF",alignItems:"center",justifyContent:"center"},heroTitle:{fontSize:23,fontWeight:"800",marginTop:14,color:"#111827"},heroText:{fontSize:15,color:"#667085",textAlign:"center",lineHeight:22,marginTop:7},label:{fontSize:15,fontWeight:"700",color:"#344054",marginBottom:8,marginTop:12},input:{backgroundColor:"#FFF",borderWidth:1,borderColor:"#D0D5DD",borderRadius:12,padding:15,fontSize:17,color:"#101828"},multiline:{minHeight:130,textAlignVertical:"top"},option:{backgroundColor:"#FFF",minHeight:78,borderRadius:14,padding:16,marginTop:24,flexDirection:"row",alignItems:"center",gap:14},optionTitle:{fontSize:16,fontWeight:"700",color:"#101828"},optionText:{fontSize:14,color:"#667085",marginTop:4}});
