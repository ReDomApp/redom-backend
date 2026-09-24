import React,{useEffect,useState} from "react";
import { SafeAreaView,View,Text,Pressable,StyleSheet,ActivityIndicator,ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeProvider";
import { ordersPaymentsService, type SubscriptionSummary } from "../services/ordersPaymentsService";

function titleForPlan(type:string){ return type==="standard" ? "ReDom Verified Standard" : "ReDom "+type.split("_").map(v=>v[0]?.toUpperCase()+v.slice(1)).join(" "); }
function money(type:string){ return type==="standard" ? "NGN4,500.00" : "Price available at checkout"; }

export function SubscriptionsScreen(){
 const navigation=useNavigation<any>(); const {colors}=useTheme(); const [items,setItems]=useState<SubscriptionSummary[]>([]); const [loading,setLoading]=useState(true);
 useEffect(()=>{void ordersPaymentsService.subscriptions().then(r=>setItems(r.subscriptions)).catch(()=>setItems([])).finally(()=>setLoading(false));},[]);
 return <SafeAreaView style={[styles.root,{backgroundColor:colors.background}]}>
  <View style={[styles.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>navigation.goBack()}><Text style={[styles.back,{color:colors.text}]}>‹</Text></Pressable><Text style={[styles.title,{color:colors.text}]}>Subscriptions</Text><View style={{width:42}}/></View>
  {loading?<ActivityIndicator color={colors.primary} style={styles.loader}/>:<ScrollView>
   {items.length ? items.map(x=><Pressable key={x.id} onPress={()=>navigation.navigate("SubscriptionDetails",{subscriptionId:x.id})} style={[styles.item,{borderBottomColor:colors.border}]}>
     <View style={[styles.logo,{borderColor:colors.border}]}><Text style={styles.logoText}>R</Text></View>
     <View style={styles.copy}><Text style={[styles.name,{color:colors.text}]}>{titleForPlan(x.subscriptionType)}</Text><Text style={[styles.meta,{color:colors.textSecondary}]}>{money(x.subscriptionType)} · {x.subscriptionStatus==="expired" ? "Expired" : x.subscriptionStatus}</Text>{x.expiresAt?<Text style={[styles.meta,{color:colors.textSecondary}]}>Expired on {new Date(x.expiresAt).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</Text>:null}</View>
     <Text style={[styles.chev,{color:colors.textSecondary}]}>›</Text>
   </Pressable>):<View style={styles.empty}><Text style={[styles.emptyTitle,{color:colors.text}]}>No subscriptions</Text><Text style={[styles.meta,{color:colors.textSecondary}]}>Your active and past ReDom subscriptions will appear here.</Text></View>}
  </ScrollView>}
 </SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14},back:{fontSize:40,width:42},title:{fontSize:19,fontWeight:"800",flex:1,textAlign:"center"},item:{minHeight:100,flexDirection:"row",alignItems:"center",paddingHorizontal:30,gap:14,borderBottomWidth:1},logo:{width:62,height:62,borderRadius:31,borderWidth:1,alignItems:"center",justifyContent:"center"},logoText:{fontSize:30,color:"#1877F2",fontWeight:"900"},copy:{flex:1},name:{fontSize:18,fontWeight:"700"},meta:{fontSize:15,lineHeight:21,marginTop:3},chev:{fontSize:30},empty:{padding:30,alignItems:"center"},emptyTitle:{fontSize:22,fontWeight:"900",marginBottom:6},loader:{marginTop:20}});