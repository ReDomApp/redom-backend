import React,{useEffect,useState}from"react";
import{SafeAreaView,View,Text,Pressable,StyleSheet,ScrollView,ActivityIndicator}from"react-native";
import{useNavigation}from"@react-navigation/native";
import{useTheme}from"../theme/ThemeProvider";
import BackIcon from"../assets/navigation/back.svg";
import ChevronIcon from"../assets/home-feed/chevron-right.svg";
import{ordersPaymentsService}from"../services/ordersPaymentsService";import type{OrderSummary}from"../services/ordersPaymentsService";

export function ReDomPayScreen(){
 const n=useNavigation<any>();const{colors}=useTheme();const[tab,setTab]=useState<"transactions"|"manage">("transactions");const[orders,setOrders]=useState<OrderSummary[]>([]);const[loading,setLoading]=useState(true);
 useEffect(()=>{void ordersPaymentsService.overview().then(r=>setOrders(r.orders)).finally(()=>setLoading(false))},[]);
 return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
  <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>n.goBack()}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>ReDom Pay</Text><View style={{width:28}}/></View>
  <View style={[s.tabs,{borderBottomColor:colors.border}]}><Pressable onPress={()=>setTab("transactions")} style={[s.tab,{borderBottomColor:tab==="transactions"?colors.text:"transparent"}]}><Text style={{color:colors.text,fontWeight:tab==="transactions"?"800":"500"}}>Transactions</Text></Pressable><Pressable onPress={()=>setTab("manage")} style={[s.tab,{borderBottomColor:tab==="manage"?colors.text:"transparent"}]}><Text style={{color:colors.text,fontWeight:tab==="manage"?"800":"500"}}>Manage</Text></Pressable></View>
  <ScrollView contentContainerStyle={s.content}>
   {tab==="transactions"?<>{loading?<ActivityIndicator color={colors.primary}/>:orders.length===0?<Text style={[s.empty,{color:colors.textSecondary}]}>No ReDom Pay transactions yet.</Text>:orders.map(o=><View key={o.transactionId} style={[s.tx,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[s.txTitle,{color:colors.text}]}>{o.title}</Text><Text style={{color:colors.textSecondary}}>{o.currency} {o.totalPrice}</Text><Text style={{color:colors.textSecondary}}>{o.orderStatus} · {o.transactionId}</Text></View>)}</>:<><Text style={[s.section,{color:colors.text}]}>Manage your saved payment info and payment controls.</Text><Row label="Payment methods" onPress={()=>n.navigate("PaymentMethods")} colors={colors}/><Row label="Security and controls" onPress={()=>n.navigate("PaymentSecurity")} colors={colors}/><Row label="Currency" onPress={()=>n.navigate("SelectCurrency")} colors={colors}/><Row label="Shipping and billing addresses" onPress={()=>n.navigate("PaymentAddresses")} colors={colors}/><Row label="Help" onPress={()=>n.navigate("MetaPaySupport")} colors={colors}/><Row label="Terms and privacy" onPress={()=>n.navigate("Policy",{slug:"payments"})} colors={colors}/></>}
  </ScrollView>
 </SafeAreaView>
}
function Row({label,onPress,colors}:{label:string;onPress:()=>void;colors:any}){return <Pressable onPress={onPress} style={[s.row,{borderBottomColor:colors.border}]}><Text style={[s.rowText,{color:colors.text}]}>{label}</Text><ChevronIcon width={20} height={20}/></Pressable>}
const s=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14},title:{fontSize:20,fontWeight:"800"},tabs:{height:56,borderBottomWidth:1,flexDirection:"row"},tab:{flex:1,alignItems:"center",justifyContent:"center",borderBottomWidth:2},content:{padding:18,paddingBottom:40},section:{fontSize:18,fontWeight:"600",lineHeight:25,marginBottom:18},row:{minHeight:62,borderBottomWidth:1,flexDirection:"row",alignItems:"center"},rowText:{fontSize:17,fontWeight:"600",flex:1},tx:{borderWidth:1,borderRadius:14,padding:15,marginBottom:10},txTitle:{fontSize:17,fontWeight:"800"},empty:{fontSize:16,marginTop:30,textAlign:"center"}});
