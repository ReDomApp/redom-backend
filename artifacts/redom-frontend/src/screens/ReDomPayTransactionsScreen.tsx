import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { ordersPaymentsService, type ReDomPayTransaction } from "../services/ordersPaymentsService";
import { ReDomPayManageScreen } from "./ReDomPayManageScreen";
import BackIcon from "../assets/navigation/back.svg";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import ChevronIcon from "../assets/home-feed/chevron-right.svg";

type Navigation=NativeStackNavigationProp<RootStackParamList>;
type Filter="all"|"money_transfer"|"orders"|"donations"|"cards";
type Tab="transactions"|"manage";
const filters:Array<[Filter,string]>=[["all","All"],["money_transfer","Money transfer"],["orders","Orders"],["donations","Donations"],["cards","Cards"]];

export function ReDomPayTransactionsScreen(){
 const navigation=useNavigation<Navigation>(); const route=useRoute<any>();
 const [tab,setTab]=useState<Tab>(route.params?.tab==="manage"?"manage":"transactions");
 useEffect(()=>{const next=route.params?.tab; if(next==="manage"||next==="transactions")setTab(next);},[route.params?.tab]);
 const selectTab=(next:Tab)=>{setTab(next);navigation.setParams({tab:next});};
 return <SafeAreaView style={s.root}>
   <View style={s.header}>
    <Pressable onPress={()=>navigation.goBack()} hitSlop={10} style={s.back}><BackIcon width={28} height={28}/></Pressable>
    <View style={s.brandTitle}><ReDomLogo width={34} height={28}/><Text style={s.headerTitle}>ReDom Pay</Text></View>
    <View style={s.spacer}/>
   </View>
   <View style={s.tabs}>
    <Pressable onPress={()=>selectTab("transactions")} style={[s.tab,tab==="transactions"&&s.tabSelected]} accessibilityRole="tab" accessibilityState={{selected:tab==="transactions"}}><Text style={[s.tabText,tab==="transactions"&&s.tabTextSelected]}>Transactions</Text></Pressable>
    <Pressable onPress={()=>selectTab("manage")} style={[s.tab,tab==="manage"&&s.tabSelected]} accessibilityRole="tab" accessibilityState={{selected:tab==="manage"}}><Text style={[s.tabText,tab==="manage"&&s.tabTextSelected]}>Manage</Text></Pressable>
   </View>
   {tab==="manage"?<ReDomPayManageScreen embedded/>:<TransactionsContent navigation={navigation}/>}
 </SafeAreaView>;
}

function TransactionsContent({navigation}:{navigation:Navigation}){
 const [selected,setSelected]=useState<Filter>("all"); const [transactions,setTransactions]=useState<ReDomPayTransaction[]>([]); const [expanded,setExpanded]=useState(true); const [loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;ordersPaymentsService.redomPayTransactions().then(r=>{if(active)setTransactions(r.transactions||[])}).catch(()=>{if(active)setTransactions([])}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const filtered=useMemo(()=>selected==="all"?transactions:transactions.filter(x=>x.category===selected),[selected,transactions]);
 const visible=expanded?filtered:filtered.slice(0,2);
 return <View style={s.transactionRoot}>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{filters.map(([key,label])=><Pressable key={key} onPress={()=>{setSelected(key);setExpanded(true)}} style={[s.filter,key===selected&&s.filterActive]}><Text style={[s.filterText,key===selected&&s.filterTextActive]}>{label}</Text></Pressable>)}</ScrollView>
   {loading?<View style={s.loader}><ActivityIndicator color="#1877F2"/></View>:<ScrollView contentContainerStyle={s.transactionContent}>
    {filtered.length===0?<View style={s.empty}><Text style={s.emptyTitle}>No transactions</Text><Text style={s.emptyText}>Transactions made in this ReDom account will appear here.</Text></View>:<View style={s.transactionCard}>
      {visible.map((transaction,index)=><TransactionRow key={transaction.transactionKey} transaction={transaction} last={index===visible.length-1} onPress={()=>navigation.navigate("PaymentTransactionDetails",{transactionId:transaction.transactionKey})}/>)}{filtered.length>2&&<Pressable onPress={()=>setExpanded(v=>!v)} style={s.see}><Text style={s.seeText}>{expanded?"See less":"See all"}</Text></Pressable>}
    </View>}
   </ScrollView>}
 </View>;
}
function TransactionRow({transaction,last,onPress}:{transaction:ReDomPayTransaction;last:boolean;onPress:()=>void}){
 return <Pressable onPress={onPress} style={[s.transactionRow,!last&&s.divider]}><View style={s.transactionIcon}><ReDomLogo width={39} height={29}/></View><View style={s.transactionInfo}><Text numberOfLines={1} style={s.product}>{transaction.productName}</Text><Text style={s.status}>{statusText(transaction)}</Text><Text style={s.date}>{formatDate(transaction.effectiveAt)}</Text>{transaction.transferMethod?<Text style={s.method}>{transaction.transferMethod}</Text>:null}</View><View style={s.amount}><Text style={s.amountText}>{formatMoney(transaction.amountMinor,transaction.currency)}</Text><ChevronIcon width={22} height={22}/></View></Pressable>;
}
function statusText(t:ReDomPayTransaction){const refund=String(t.refundStatus||"").toLowerCase();if(refund==="processed")return "Refunded";if(refund==="failed")return "Partially Refunded";const v=String(t.status||"").toLowerCase();const m:Record<string,string>={paid:"Completed",success:"Completed",completed:"Completed",failed:"Failed",processing:"Ongoing",ongoing:"Ongoing",pending:"Pending",initialized:"Pending Verification",unverified:"Unverified Transaction"};return m[v]||v.replaceAll("_"," ");}
function formatDate(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?"":d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});}
function formatMoney(minor:string,currency:string){const n=Number(minor)/100;if(!Number.isFinite(n))return currency+"0.00";const fixed=n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});const symbols:Record<string,string>={USD:"$",CAD:"$",AUD:"$",NZD:"$",SGD:"$",EUR:"€",GBP:"£",JPY:"¥",CNY:"¥"};return (symbols[currency]||currency+" ")+fixed;}

const s=StyleSheet.create({
 root:{flex:1,backgroundColor:"#fff"},header:{minHeight:88,paddingHorizontal:31,flexDirection:"row",alignItems:"center"},back:{width:42,height:42,alignItems:"flex-start",justifyContent:"center"},brandTitle:{flex:1,flexDirection:"row",alignItems:"center",gap:6,marginLeft:7},headerTitle:{color:"#1C1E21",fontSize:27,fontWeight:"500"},spacer:{width:42},tabs:{height:61,marginHorizontal:31,flexDirection:"row",borderBottomWidth:1,borderBottomColor:"#DADDE1"},tab:{flex:1,alignItems:"center",justifyContent:"center",borderBottomWidth:2,borderBottomColor:"transparent"},tabSelected:{borderBottomColor:"#1C1E21"},tabText:{color:"#65676B",fontSize:21,fontWeight:"500"},tabTextSelected:{color:"#1C1E21",fontWeight:"700"},transactionRoot:{flex:1},filters:{paddingHorizontal:30,paddingVertical:22,gap:14},filter:{minHeight:56,paddingHorizontal:19,borderRadius:14,borderWidth:1,borderColor:"#DADDE1",alignItems:"center",justifyContent:"center"},filterActive:{backgroundColor:"#1C1E21",borderColor:"#1C1E21"},filterText:{color:"#1C1E21",fontSize:17,fontWeight:"700"},filterTextActive:{color:"#fff"},transactionContent:{paddingHorizontal:30,paddingBottom:40},loader:{flex:1,alignItems:"center",justifyContent:"center"},transactionCard:{borderWidth:1,borderColor:"#DADDE1",borderRadius:18,overflow:"hidden"},transactionRow:{minHeight:145,paddingHorizontal:24,paddingVertical:20,flexDirection:"row",alignItems:"flex-start"},divider:{borderBottomWidth:1,borderBottomColor:"#DADDE1"},transactionIcon:{width:54,height:54,borderRadius:27,borderWidth:1,borderColor:"#E1E3E6",alignItems:"center",justifyContent:"center",marginRight:17},transactionInfo:{flex:1,paddingRight:8},product:{color:"#1C1E21",fontSize:18,fontWeight:"600"},status:{color:"#65676B",fontSize:16,marginTop:4},date:{color:"#65676B",fontSize:16,marginTop:1},method:{color:"#65676B",fontSize:14,marginTop:3},amount:{minWidth:90,alignItems:"flex-end",paddingTop:14,gap:7},amountText:{color:"#65676B",fontSize:16},see:{paddingHorizontal:24,paddingVertical:20},seeText:{color:"#1877F2",fontSize:17,fontWeight:"700"},empty:{paddingVertical:60,alignItems:"center"},emptyTitle:{fontSize:20,fontWeight:"700"},emptyText:{fontSize:16,color:"#65676B",textAlign:"center",marginTop:7,maxWidth:320}
});
