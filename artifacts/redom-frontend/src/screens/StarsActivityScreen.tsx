import React,{useEffect,useState} from "react";
import { SafeAreaView,View,Text,Pressable,StyleSheet,ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeProvider";
import { ordersPaymentsService } from "../services/ordersPaymentsService";

export function StarsActivityScreen() {
  const navigation=useNavigation(); const {colors}=useTheme(); const [loading,setLoading]=useState(true); const [count,setCount]=useState(0);
  useEffect(()=>{void ordersPaymentsService.starsActivity().then(r=>setCount(r.activity.length)).catch(()=>setCount(0)).finally(()=>setLoading(false));},[]);
  return <SafeAreaView style={[styles.root,{backgroundColor:colors.background}]}>
    <View style={[styles.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>navigation.goBack()}><Text style={[styles.back,{color:colors.text}]}>‹</Text></Pressable><Text style={[styles.title,{color:colors.text}]}>Stars activity</Text></View>
    {loading?<ActivityIndicator color={colors.primary} style={styles.loader}/>:<View style={styles.empty}><Text style={[styles.heading,{color:colors.text}]}>{count?"Activity":"No Stars activity found."}</Text></View>}
  </SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14},back:{fontSize:40,width:42},title:{fontSize:19,fontWeight:"800",flex:1,textAlign:"center"},empty:{alignItems:"center",paddingTop:35},heading:{fontSize:20,fontWeight:"800"},loader:{marginTop:20}});