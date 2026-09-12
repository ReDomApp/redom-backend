import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import BackIcon from "../assets/edit-profile/back.svg";
import { api } from "../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "CoverPhotoPreview">;
export function CoverPhotoPreviewScreen({ navigation, route }: Props) {
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const words = caption.trim() ? caption.trim().split(/\s+/).filter(Boolean).length : 0;
  useEffect(() => { if (!saving) return; const t=setInterval(()=>setProgress(p=>Math.min(94,p+1)),80); return ()=>clearInterval(t); }, [saving]);
  const save = async () => {
    if (words > 20) return Alert.alert("Caption too long", "Use no more than 20 words.");
    if (!route.params.base64) return Alert.alert("Cover photo", "The selected image could not be prepared.");
    setSaving(true); setProgress(1);
    try { await api.post("/profile/media/upload", { kind:"cover", image:`data:image/jpeg;base64,${route.params.base64}`, caption:caption.trim(), shareToFeed:true }); setProgress(100); await new Promise(r=>setTimeout(r,250)); Alert.alert("Cover Photo Uploaded!!","Your cover photo has been updated and the profile update was added to your Feed.",[{text:"OK",onPress:()=>navigation.popToTop()}]); } catch(e) { Alert.alert("Upload failed",e instanceof Error?e.message:"Unable to upload your cover photo."); } finally { setSaving(false); }
  };
  return <SafeAreaView style={styles.root}><View style={styles.header}><Pressable onPress={()=>navigation.goBack()}><BackIcon width={26} height={26}/></Pressable><Text style={styles.title}>Preview cover photo</Text><Pressable style={styles.save} onPress={()=>void save()} disabled={saving}><Text style={styles.saveText}>SAVE</Text></Pressable></View><View style={styles.stage}><Image source={{uri:route.params.uri}} style={styles.cover} resizeMode="cover"/></View><TextInput value={caption} onChangeText={setCaption} placeholder="Say something about your cover photo....." placeholderTextColor="#65676B" multiline maxLength={200} style={styles.caption}/><View style={styles.feed}><Text style={styles.feedText}>Share your update to Feed</Text><View style={styles.checked}><Text style={styles.check}>✓</Text></View></View>{saving?<View style={styles.overlay}><ActivityIndicator size="large" color="#1877F2"/><Text style={styles.progress}>{progress}% loading...</Text><Text style={styles.sub}>Uploading and waiting for ReDom/Neon to establish the cover photo.</Text></View>:null}</SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:"#fff"},header:{height:64,paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderBottomWidth:1,borderBottomColor:"#E4E6EB"},title:{fontSize:19,color:"#050505"},save:{backgroundColor:"#1877F2",borderRadius:10,paddingHorizontal:17,paddingVertical:11},saveText:{color:"#fff",fontWeight:"700"},stage:{backgroundColor:"#000",height:300,justifyContent:"center"},cover:{width:"100%",height:"100%"},caption:{margin:20,minHeight:90,borderWidth:1,borderColor:"#CCD0D5",borderRadius:14,padding:14,fontSize:16,color:"#050505",textAlignVertical:"top"},feed:{margin:20,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},feedText:{fontSize:17,fontWeight:"600",color:"#050505"},checked:{width:30,height:30,borderRadius:4,backgroundColor:"#1877F2",alignItems:"center",justifyContent:"center"},check:{color:"#fff",fontSize:22,fontWeight:"700"},overlay:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(255,255,255,.96)",alignItems:"center",justifyContent:"center",padding:30},progress:{marginTop:18,fontSize:22,fontWeight:"700",color:"#050505"},sub:{marginTop:8,textAlign:"center",color:"#65676B",fontSize:14,lineHeight:20}});
