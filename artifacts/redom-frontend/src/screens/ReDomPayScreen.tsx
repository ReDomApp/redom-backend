import React,{useEffect,useMemo,useState}from"react";
import{SafeAreaView,View,Text,Pressable,StyleSheet,ScrollView,ActivityIndicator}from"react-native";
import{useNavigation}from"@react-navigation/native";
import{useTheme}from"../theme/ThemeProvider";
import BackIcon from"../assets/navigation/back.svg";
import ChevronIcon from"../assets/home-feed/chevron-right.svg";
import StarsIcon from"../assets/home-feed/stars.svg";
import SecurityIcon from"../assets/home-feed/security-controls.svg";
import TermsIcon from"../assets/home-feed/terms-policies.svg";
import HelpIcon from"../assets/home-feed/help-support.svg";
import{ordersPaymentsService,type OrderSummary,type PaymentTransactionSummary}from"../services/ordersPaymentsService";

type Tab="all"|"money_transfer"|"orders"|"donations";

export function ReDomPayScreen(){
 const n=useNavigation<any>();const{colors}=useTheme();
 const[tab,setTab]=useState<Tab>("all");const[orders,setOrders]=useState<OrderSummary[]>([]);const[payments,setPayments]=useState<PaymentTransactionSummary[]>([]);
 const[stars,setStars]=useState(0);const[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;(async()=>{try{const[r,s]=await Promise.all([ordersPaymentsService.overview(),ordersPaymentsService.starsActivity()]);if(active){setOrders(r.orders);setPayments(r.payments);setStars(s.balance)}}catch{}finally{if(active)setLoading(false)}})();return()=>{active=false}},[]);
 const visiblePayments=useMemo(()=>payments.filter(p=>{const purpose=p.purpose.toLowerCase();if(tab==="all")return true;if(tab==="money_transfer")return ["money_transfer","transfer","p2p_transfer"].includes(purpose);if(tab==="donations")return ["donation","donations"].includes(purpose);return ["order","marketplace_order","stars_purchase","subscription"].includes(purpose)}),[payments,tab]);
 const visibleOrders=tab==="orders"||tab==="all"?orders:[];
 return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
  <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}>
   <Pressable onPress={()=>n.goBack()}><BackIcon width={24} height={24}/></Pressable>
   <Text style={[s.title,{color:colors.text}]}>ReDom Pay</Text><View style={{width:24}}/>
  </View>
  <ScrollView contentContainerStyle={s.content}>
   <Text style={[s.heading,{color:colors.text}]}>Transactions</Text>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
    {([["all","All"],["money_transfer","Money transfer"],["orders","Orders"],["donations","Donations"]] as const).map(([key,label])=><Pressable key={key} onPress={()=>setTab(key)} style={[s.tab,{backgroundColor:tab===key?colors.primary:colors.surface,borderColor:tab===key?colors.primary:colors.border}]}><Text style={{color:tab===key?"#fff":colors.text,fontWeight:"800"}}>{label}</Text></Pressable>)}
   </ScrollView>
   {loading?<ActivityIndicator color={colors.primary} style={s.loader}/>:visibleOrders.length===0&&visiblePayments.length===0?<Text style={[s.empty,{color:colors.textSecondary}]}>No transactions in this section yet.</Text>:<>{visibleOrders.map(o=><View key={"order-"+o.transactionId} style={[s.tx,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[s.txTitle,{color:colors.text}]}>{o.title}</Text><Text style={{color:colors.textSecondary}}>Order · {o.currency} {o.totalPrice}</Text><Text style={{color:colors.textSecondary}}>{o.orderStatus} · {o.transactionId}</Text></View>)}{visiblePayments.map(p=><View key={"payment-"+p.id} style={[s.tx,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[s.txTitle,{color:colors.text}]}>{p.purpose==="stars_purchase"?"ReDom Stars purchase":p.purpose==="subscription"?"Subscription":p.purpose==="donation"?"Donation":p.purpose==="money_transfer"?"Money transfer":"Payment"}</Text><Text style={{color:colors.textSecondary}}>{p.currency} {(Number(p.amountMinor)/100).toFixed(2)} · {p.status}</Text><Text style={{color:colors.textSecondary}}>{p.redomTransactionId||p.reference}</Text></View>)}</>}
   <Text style={[s.section,{color:colors.text}]}>Balances</Text>
   <View style={[s.balanceCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>
    <StarsIcon width={30} height={30} color={colors.text}/><View style={{flex:1}}><Text style={[s.balanceTitle,{color:colors.text}]}>ReDom Stars</Text><Text style={{color:colors.textSecondary}}>{stars.toLocaleString()} Stars available</Text></View>
    <Pressable onPress={()=>n.navigate("BuyStars")} style={[s.smallButton,{backgroundColor:colors.primary}]}><Text style={s.smallButtonText}>Buy</Text></Pressable>
   </View>
   <Pressable onPress={()=>n.navigate("StarsActivity")} style={[s.linkRow,{borderBottomColor:colors.border}]}><Text style={[s.linkText,{color:colors.text}]}>Stars activity</Text><ChevronIcon width={20} height={20}/></Pressable>
   <Text style={[s.section,{color:colors.text}]}>Manage</Text>
   <Row label="Payment methods" subtitle="Saved cards and supported payment methods" onPress={()=>n.navigate("PaymentMethods")} colors={colors}/>
   <Row label="Add payment method" subtitle="Add a method through secure provider checkout" onPress={()=>n.navigate("PaymentMethods")} colors={colors}/>
   <Row label="Shipping and billing addresses" subtitle="Manage saved addresses and address suggestions" onPress={()=>n.navigate("PaymentAddresses")} colors={colors}/>
   <Row label="Email" subtitle="Payment receipts and transaction notices" onPress={()=>n.navigate("EditProfile")} colors={colors}/>
   <Row label="Phone" subtitle="Payment and account contact information" onPress={()=>n.navigate("EditProfile")} colors={colors}/>
   <Row Icon={SecurityIcon} label="Security and payment PIN" subtitle="PIN, biometrics and payment security" onPress={()=>n.navigate("PaymentSecurity")} colors={colors}/>
   <Row label="Currency" subtitle="Choose the currency used for payment presentation" onPress={()=>n.navigate("SelectCurrency")} colors={colors}/>
   <Row Icon={HelpIcon} label="Help" subtitle="ReDom Pay support and payment questions" onPress={()=>n.navigate("MetaPaySupport")} colors={colors}/>
   <Row Icon={TermsIcon} label="Terms and privacy" subtitle="Read the ReDom Payments Terms" onPress={()=>n.navigate("Policy",{slug:"payments"})} colors={colors}/>
  </ScrollView>
 </SafeAreaView>
}
function Row({Icon,label,subtitle,onPress,colors}:{Icon?:any;label:string;subtitle:string;onPress:()=>void;colors:any}){return <Pressable onPress={onPress} style={[s.row,{borderBottomColor:colors.border}]}>{Icon?<Icon width={26} height={26} color={colors.text}/>:<View style={s.textIcon}/>}<View style={{flex:1,marginLeft:14}}><Text style={[s.rowTitle,{color:colors.text}]}>{label}</Text><Text style={[s.rowSubtitle,{color:colors.textSecondary}]}>{subtitle}</Text></View><ChevronIcon width={20} height={20}/></Pressable>}
const s=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14},title:{fontSize:19,fontWeight:"800"},content:{padding:18,paddingBottom:50},heading:{fontSize:24,fontWeight:"900",marginBottom:10},tabs:{gap:8,paddingBottom:5},tab:{paddingHorizontal:16,paddingVertical:11,borderRadius:22,borderWidth:1},loader:{marginTop:25},empty:{fontSize:16,textAlign:"center",paddingVertical:25},tx:{borderWidth:1,borderRadius:14,padding:15,marginTop:9},txTitle:{fontSize:17,fontWeight:"800",marginBottom:4},section:{fontSize:21,fontWeight:"900",marginTop:30,marginBottom:10},balanceCard:{borderWidth:1,borderRadius:16,padding:15,flexDirection:"row",alignItems:"center",gap:12},balanceTitle:{fontSize:17,fontWeight:"800"},smallButton:{paddingHorizontal:18,paddingVertical:10,borderRadius:20},smallButtonText:{color:"#fff",fontWeight:"800"},linkRow:{minHeight:54,borderBottomWidth:1,flexDirection:"row",alignItems:"center"},linkText:{fontSize:16,fontWeight:"700",flex:1},row:{minHeight:72,borderBottomWidth:1,flexDirection:"row",alignItems:"center"},rowTitle:{fontSize:17,fontWeight:"700"},rowSubtitle:{fontSize:13,lineHeight:18,marginTop:2},textIcon:{width:26,height:26}});
