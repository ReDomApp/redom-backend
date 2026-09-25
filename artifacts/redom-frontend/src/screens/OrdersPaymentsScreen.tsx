import React,{useEffect,useMemo,useState}from"react";
import{ActivityIndicator,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,View}from"react-native";
import{useNavigation}from"@react-navigation/native";
import{useTheme}from"../theme/ThemeProvider";
import{ordersPaymentsService,type OrderSummary,type PaymentTransactionSummary}from"../services/ordersPaymentsService";
import BackIcon from"../assets/navigation/back.svg";
import CartIcon from"../assets/home-feed/cart.svg";
import StarsIcon from"../assets/home-feed/stars.svg";
import SubscriptionsIcon from"../assets/home-feed/subscriptions.svg";
import SecurityIcon from"../assets/home-feed/security-controls.svg";
import HelpIcon from"../assets/home-feed/help-support.svg";
import TermsIcon from"../assets/home-feed/terms-policies.svg";
import ChevronIcon from"../assets/home-feed/chevron-right.svg";

type Tab="all"|"money_transfer"|"orders"|"donations";

export function OrdersPaymentsScreen(){
 const n=useNavigation<any>();const{colors}=useTheme();
 const[tab,setTab]=useState<Tab>("all");const[orders,setOrders]=useState<OrderSummary[]>([]);const[payments,setPayments]=useState<PaymentTransactionSummary[]>([]);const[stars,setStars]=useState(0);const[loading,setLoading]=useState(true);
 const load=async()=>{setLoading(true);try{const[o,s]=await Promise.all([ordersPaymentsService.overview(),ordersPaymentsService.starsActivity()]);setOrders(o.orders);setPayments(o.payments);setStars(s.balance)}catch{}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const visiblePayments=useMemo(()=>payments.filter(p=>{const x=p.purpose.toLowerCase();if(tab==="all")return true;if(tab==="money_transfer")return["money_transfer","transfer","p2p_transfer"].includes(x);if(tab==="donations")return["donation","donations"].includes(x);return["order","marketplace_order","stars_purchase","subscription","subscription_renewal"].includes(x)}),[payments,tab]);
 const visibleOrders=tab==="all"||tab==="orders"?orders:[];
 return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
  <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>n.goBack()}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>Orders and payments</Text><Pressable onPress={()=>n.navigate("Cart")}><CartIcon width={24} height={24}/></Pressable></View>
  <ScrollView contentContainerStyle={s.content}>
   <Text style={[s.heading,{color:colors.text}]}>Transactions</Text>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>{([["all","All"],["money_transfer","Money transfer"],["orders","Orders"],["donations","Donations"]] as const).map(([k,l])=><Pressable key={k} onPress={()=>setTab(k)} style={[s.tab,{backgroundColor:tab===k?colors.primary:colors.surface,borderColor:tab===k?colors.primary:colors.border}]}><Text style={{color:tab===k?"#fff":colors.text,fontWeight:"800"}}>{l}</Text></Pressable>)}</ScrollView>
   {loading?<ActivityIndicator color={colors.primary} style={s.loader}/>:visibleOrders.length===0&&visiblePayments.length===0?<Text style={[s.empty,{color:colors.textSecondary}]}>No transactions in this section yet.</Text>:<>{visibleOrders.map(o=><View key={"o"+o.transactionId} style={[s.tx,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[s.txTitle,{color:colors.text}]}>{o.title}</Text><Text style={{color:colors.textSecondary}}>Order · {o.currency} {o.totalPrice}</Text><Text style={{color:colors.textSecondary}}>{o.orderStatus} · {o.transactionId}</Text></View>)}{visiblePayments.map(p=><View key={"p"+p.id} style={[s.tx,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[s.txTitle,{color:colors.text}}>{p.purpose==="stars_purchase"?"ReDom Stars purchase":p.purpose==="subscription_renewal"?"Subscription renewal":p.purpose==="donation"?"Donation":p.purpose==="money_transfer"?"Money transfer":"Payment"}</Text><Text style={{color:colors.textSecondary}}>{p.currency} {(Number(p.amountMinor)/100).toFixed(2)} · {p.status}</Text><Text style={{color:colors.textSecondary}}>{p.redomTransactionId||p.reference}</Text></View>)}</>}
   <Text style={[s.section,{color:colors.text}]}>Balances</Text>
   <View style={[s.balance,{backgroundColor:colors.surface,borderColor:colors.border}]}><StarsIcon width={30} height={30} color={colors.text}/><View style={{flex:1}}><Text style={[s.balanceTitle,{color:colors.text}]}>ReDom Stars</Text><Text style={{color:colors.textSecondary}}>{stars.toLocaleString()} Stars available</Text></View><Pressable onPress={()=>n.navigate("BuyStars")} style={[s.buy,{backgroundColor:colors.primary}]}><Text style={s.buyText}>Buy Stars</Text></Pressable></View>
   <Row label="Stars activity" Icon={StarsIcon} onPress={()=>n.navigate("StarsActivity")} colors={colors}/>
   <Text style={[s.section,{color:colors.text}]}>Payment information</Text>
   <Row label="Payment methods" onPress={()=>n.navigate("PaymentMethods")} colors={colors}/>
   <Row label="Add payment method" onPress={()=>n.navigate("PaymentMethods",{autoAdd:true})} colors={colors}/>
   <Row label="Subscriptions" Icon={SubscriptionsIcon} onPress={()=>n.navigate("Subscriptions")} colors={colors}/>
   <Text style={[s.section,{color:colors.text}]}>Manage</Text>
   <Row label="Shipping and billing addresses" onPress={()=>n.navigate("PaymentAddresses")} colors={colors}/>
   <Row label="Email" subtitle="Payment receipts and transaction notices" onPress={()=>n.navigate("EditProfile")} colors={colors}/>
   <Row label="Phone" subtitle="Payment and account contact information" onPress={()=>n.navigate("EditProfile")} colors={colors}/>
   <Row label="Security and payment PIN" Icon={SecurityIcon} subtitle="PIN, biometrics and payment security" onPress={()=>n.navigate("PaymentSecurity")} colors={colors}/>
   <Row label="Currency" subtitle="Choose the currency used for payment presentation" onPress={()=>n.navigate("SelectCurrency")} colors={colors}/>
   <Row label="Help" Icon={HelpIcon} subtitle="ReDom Pay support and payment questions" onPress={()=>n.navigate("MetaPaySupport")} colors={colors}/>
   <Row label="Terms and privacy" Icon={TermsIcon} subtitle="Read the ReDom Payments Terms" onPress={()=>n.navigate("Policy",{slug:"payments"})} colors={colors}/>
  </ScrollView>
 </SafeAreaView>
}
function Row({label,subtitle,Icon,onPress,colors}:{label:string;subtitle?:string;Icon?:any;onPress:()=>void;colors:any}){return <Pressable onPress={onPress} style={[s.row,{borderBottomColor:colors.border}]}>{Icon?<Icon width={27} height={27} color={colors.text}/>:<View style={s.placeholder}/>}<View style={{flex:1,marginLeft:14}}><Text style={[s.rowTitle,{color:colors.text}]}>{label}</Text>{subtitle?<Text style={[s.rowSub,{color:colors.textSecondary}]}>{subtitle}</Text>:null}</View><ChevronIcon width={20} height={20}/></Pressable>}
const s=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14},title:{fontSize:19,fontWeight:"800"},content:{padding:18,paddingBottom:50},heading:{fontSize:24,fontWeight:"900",marginBottom:10},tabs:{gap:8,paddingBottom:5},tab:{paddingHorizontal:16,paddingVertical:11,borderRadius:22,borderWidth:1},loader:{marginTop:25},empty:{fontSize:16,textAlign:"center",paddingVertical:25},tx:{borderWidth:1,borderRadius:14,padding:15,marginTop:9},txTitle:{fontSize:17,fontWeight:"800",marginBottom:4},section:{fontSize:21,fontWeight:"900",marginTop:30,marginBottom:8},balance:{borderWidth:1,borderRadius:16,padding:15,flexDirection:"row",alignItems:"center",gap:12},balanceTitle:{fontSize:17,fontWeight:"800"},buy:{paddingHorizontal:14,paddingVertical:10,borderRadius:20},buyText:{color:"#fff",fontWeight:"800"},row:{minHeight:66,borderBottomWidth:1,flexDirection:"row",alignItems:"center"},placeholder:{width:27,height:27},rowTitle:{fontSize:17,fontWeight:"700"},rowSub:{fontSize:13,lineHeight:18,marginTop:2}});
