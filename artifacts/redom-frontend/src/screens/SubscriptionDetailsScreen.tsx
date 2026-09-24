import React,{useEffect,useState} from "react";
import { SafeAreaView,View,Text,Pressable,StyleSheet,ScrollView,ActivityIndicator,Alert } from "react-native";
import { useNavigation,useRoute } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeProvider";
import { ordersPaymentsService, type SubscriptionSummary } from "../services/ordersPaymentsService";
import BackIcon from "../assets/navigation/back.svg";
import ReDomMark from "../assets/brand/redom-mark.svg";

function titleForPlan(type:string){return type==="standard"?"ReDom Verified Standard":"ReDom "+type.split("_").map(v=>v[0]?.toUpperCase()+v.slice(1)).join(" ");}
function priceForPlan(type:string){return type==="standard"?"NGN4,500.00/month":"Price available at checkout";}

export function SubscriptionDetailsScreen(){
 const navigation=useNavigation<any>(); const route=useRoute<any>(); const {colors}=useTheme(); const [x,setX]=useState<SubscriptionSummary|null>(null);
 useEffect(()=>{void ordersPaymentsService.subscriptions().then(r=>setX(r.subscriptions.find(i=>i.id===route.params.subscriptionId)||null)).catch(()=>setX(null));},[route.params.subscriptionId]);
 if(!x)return <SafeAreaView style={[styles.root,{backgroundColor:colors.background}]}><ActivityIndicator color={colors.primary} style={styles.loader}/></SafeAreaView>;
 const expired=x.subscriptionStatus==="expired" || (x.expiresAt ? new Date(x.expiresAt).getTime()<Date.now() : false);
 return <SafeAreaView style={[styles.root,{backgroundColor:colors.background}]}>
  <View style={[styles.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>navigation.goBack()}><BackIcon width={24} height={24}/></Pressable><Text style={[styles.title,{color:colors.text}]}>Subscription details</Text><View style={{width:42}}/></View>
  <ScrollView>
   <View style={[styles.top,{borderBottomColor:colors.border}]}><View style={[styles.logo,{borderColor:colors.border}]}><ReDomMark width={46} height={46}/></View><View><Text style={[styles.plan,{color:colors.text}]}>{titleForPlan(x.subscriptionType)}</Text><Text style={[styles.muted,{color:colors.textSecondary}]}>Recurring {x.billingCycle} payment</Text></View></View>
   <Info label="Status" value={expired ? (x.expiresAt ? `Expired on ${new Date(x.expiresAt).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}` : "Expired") : x.subscriptionStatus} colors={colors}/>
   <Info label="Date subscribed" value={x.startedAt?new Date(x.startedAt).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}):"Not available"} colors={colors}/>
   <Info label="Payment plan" value={priceForPlan(x.subscriptionType)} colors={colors}/>
   <View style={[styles.notice,{borderTopColor:colors.border,borderBottomColor:colors.border}]}><Text style={[styles.muted,{color:colors.textSecondary}]}>You have authorized ReDom to charge you on a recurring basis, and the terms of each payment are governed by the ReDom Payments Terms and applicable subscription terms.</Text></View>
   <Pressable onPress={()=>expired ? navigation.navigate("SubscriptionRenewal",{subscriptionId:x.id,subscriptionName:titleForPlan(x.subscriptionType)}) : Alert.alert("Manage subscription","Subscription management is handled through the supported payment provider.")} style={[styles.button,{backgroundColor:colors.primary}]}><Text style={styles.buttonText}>{expired?"Renew subscription":"Manage subscription"}</Text></Pressable>
   <Pressable onPress={()=>navigation.navigate("Support")}><Text style={[styles.help,{color:colors.primary}]}>Visit help center</Text></Pressable>
  </ScrollView>
 </SafeAreaView>;
}
function Info(p:{label:string;value:string;colors:any}){return <View style={styles.info}><Text style={[styles.label,{color:p.colors.textSecondary}]}>{p.label}</Text><Text style={[styles.value,{color:p.colors.text}]}>{p.value}</Text></View>}
const styles=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14},back:{fontSize:40,width:42},title:{fontSize:19,fontWeight:"800",flex:1,textAlign:"center"},top:{padding:20,borderBottomWidth:1,flexDirection:"row",alignItems:"center",gap:14},logo:{width:78,height:78,borderRadius:39,borderWidth:1,alignItems:"center",justifyContent:"center"},plan:{fontSize:23,fontWeight:"800"},muted:{fontSize:15,lineHeight:22,marginTop:5},info:{paddingHorizontal:30,paddingTop:20},label:{fontSize:14},value:{fontSize:17,marginTop:3},notice:{padding:20,marginTop:24,borderTopWidth:1,borderBottomWidth:1},button:{margin:20,paddingVertical:15,borderRadius:10,alignItems:"center"},buttonText:{color:"#fff",fontSize:16,fontWeight:"800"},help:{textAlign:"center",fontSize:16,fontWeight:"700",marginBottom:30},loader:{marginTop:20}});