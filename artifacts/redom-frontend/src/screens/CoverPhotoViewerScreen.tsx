import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import CloseIcon from "../assets/navigation/close.svg";
import { profileService } from "../profile/service";

type Props = NativeStackScreenProps<RootStackParamList, "CoverPhotoViewer">;
export function CoverPhotoViewerScreen({ navigation }: Props) {
  const [uri,setUri]=useState<string|null>(null);
  useEffect(()=>{void profileService.getProfile().then(r=>setUri(r.profile.coverPhoto)).catch(()=>undefined);},[]);
  return <SafeAreaView style={styles.root}><View style={styles.top}><Pressable onPress={()=>navigation.goBack()}><CloseIcon width={28} height={28}/></Pressable></View><View style={styles.stage}>{uri?<Image source={{uri}} style={styles.image} resizeMode="contain"/>:<ActivityIndicator size="large" color="#fff"/>}</View><Text style={styles.label}>Cover photo</Text></SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:"#000"},top:{height:60,paddingHorizontal:18,justifyContent:"center"},stage:{flex:1,justifyContent:"center",alignItems:"center"},image:{width:"100%",height:"75%"},label:{color:"#fff",fontSize:16,fontWeight:"600",padding:20}});
