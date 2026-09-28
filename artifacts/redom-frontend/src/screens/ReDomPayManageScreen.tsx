import { useCallback, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { useAuthContext } from "../auth/context";
import { ordersPaymentsService, type PaymentAddress, type SavedPaymentMethod } from "../services/ordersPaymentsService";
import AddPaymentIcon from "../assets/home-feed/add-payment-method.svg";
import SecurityIcon from "../assets/home-feed/security.svg";
import ChevronIcon from "../assets/home-feed/chevron-right.svg";
import SettingsIcon from "../assets/home-feed/settings.svg";
import StarsIcon from "../assets/home-feed/stars.svg";
import VisaIcon from "../assets/payment/card-brands/visa.svg";
import MastercardIcon from "../assets/payment/card-brands/mastercard.svg";
import AmexIcon from "../assets/payment/card-brands/american-express.svg";
import DiscoverIcon from "../assets/payment/card-brands/discover.svg";
import JcbIcon from "../assets/payment/card-brands/jcb.svg";
import UnionPayIcon from "../assets/payment/card-brands/unionpay.svg";
import VerveIcon from "../assets/payment/card-brands/verve.svg";

type Nav=NativeStackNavigationProp<RootStackParamList>;
const blue="#1877F2";
function countryName(code:string|null){if(!code)return "Unknown country";try{return new Intl.DisplayNames(["en"],{type:"region"}).of(code)||code;}catch{return code||"Unknown country";}}
function BrandIcon({brand}:{brand:string|null}){const b=(brand||"").toLowerCase();const C=b==="visa"?VisaIcon:b==="mastercard"?MastercardIcon:b.includes("american")||b==="amex"?AmexIcon:b==="discover"?DiscoverIcon:b==="jcb"?JcbIcon:b==="unionpay"?UnionPayIcon:b==="verve"?VerveIcon:AddPaymentIcon;return <C width={52} height={32}/>;}

export function ReDomPayManageScreen({embedded=false}:{embedded?:boolean}){
 const navigation=useNavigation<Nav>(); const {user}=useAuthContext();
 const [methods,setMethods]=useState<SavedPaymentMethod[]>([]); const [loading,setLoading]=useState(true);
 const [backup,setBackup]=useState(true); const [backupSheet,setBackupSheet]=useState(false); const [pendingBackup,setPendingBackup]=useState(true);
 const [stars,setStars]=useState(0); const [address,setAddress]=useState<PaymentAddress|null>(null); const [currency,setCurrency]=useState("USD");
 const load=useCallback(async()=>{setLoading(true);try{
   const [m,b,s,a,settings]=await Promise.all([ordersPaymentsService.paymentMethods(),ordersPaymentsService.backupPaymentMethods(),ordersPaymentsService.starsActivity(),ordersPaymentsService.paymentAddresses(),ordersPaymentsService.getSettings()]);
   setMethods(m.methods||[]);setBackup(b.enabled);setPendingBackup(b.enabled);setStars(Number(s.balance||0));
   setAddress((a.addresses||[]).find(x=>x.is_default)??a.addresses?.[0]??null);setCurrency(settings.settings?.currency||"USD");
 }catch{setMethods([]);}finally{setLoading(false);}},[]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 const saveBackup=async()=>{try{const r=await ordersPaymentsService.setBackupPaymentMethods(pendingBackup);setBackup(r.enabled);setBackupSheet(false);}catch{Alert.alert("Backup payment methods","We couldn't save this setting. Please try again.");}};
 const status=(m:SavedPaymentMethod)=>m.status==="suspended"?"Suspended":m.status==="unavailable"?"Unavailable":m.reusable?"Active":"Unavailable";
 const content=<ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
   <Text style={s.sectionTitle}>Payment Information</Text>
   <Text style={s.description}>Manage payment methods and payment information saved to your ReDom Pay account.</Text>
   <Pressable onPress={()=>navigation.navigate("Policy",{slug:"payments"})}><Text style={s.learn}>Learn more</Text></Pressable>
   <View style={s.group}>
    {loading?<Text style={s.loading}>Loading payment methods...</Text>:methods.length===0?<View style={s.empty}>
      <AddPaymentIcon width={82} height={82}/><Text style={s.emptyTitle}>Add a payment method</Text><Text style={s.emptyText}>Save a card or other eligible payment method with ReDom Pay.</Text>
      <Pressable onPress={()=>navigation.navigate("AddPaymentMethod")} style={s.primary}><Text style={s.primaryText}>Add a payment method</Text></Pressable>
    </View>:<Pressable onPress={()=>navigation.navigate("ReviewPaymentInfo",{paymentMethodId:methods[0].id})} style={s.manageEntry}>
      <View style={s.icon}><AddPaymentIcon width={34} height={34}/></View><Text style={s.rowTitleOnly}>Manage payment method</Text><ChevronIcon width={22} height={22}/>
    </Pressable>}
   </View>
   {!loading&&methods.length>0&&<><Text style={s.sectionTitle}>Saved payment methods</Text><View style={s.group}>
     {methods.map((m,i)=><View key={m.id}>{i>0&&<View style={s.divider}/>}<Pressable onPress={()=>navigation.navigate("ReviewPaymentInfo",{paymentMethodId:m.id})} style={s.methodRow}>
       <View style={s.brand}><BrandIcon brand={m.brand}/></View><View style={s.flex}><Text style={s.methodName}>{m.brand||"Card"}-{m.last4||"••••"}</Text><Text style={[s.status,status(m)==="Active"?s.active:status(m)==="Unavailable"?s.unavailable:s.suspended]}>{status(m)}{m.countryCode?" • "+countryName(m.countryCode):""}</Text></View><ChevronIcon width={22} height={22}/>
     </Pressable></View>)}
   </View></>}
   {!loading&&methods.length>0&&<><Text style={s.sectionTitle}>Backup payment methods</Text><View style={s.group}><Pressable onPress={()=>{setPendingBackup(backup);setBackupSheet(true)}} style={s.row}>
     <View style={s.icon}><SecurityIcon width={32} height={32}/></View><View style={s.flex}><Text style={s.rowTitle}>Backup payment methods</Text><Text style={s.rowValue}>{backup?"On":"Off"}</Text><Text style={s.rowDescription}>Backup Payment Method is meant to keep your subscription or products active & running even if card A failed.</Text></View><ChevronIcon width={22} height={22}/>
   </Pressable></View></>}
   <Text style={s.sectionTitle}>Balances</Text><View style={s.group}>
    <Pressable onPress={()=>navigation.navigate("StarsActivity")} style={s.row}><View style={s.icon}><StarsIcon width={32} height={32}/></View><Text style={s.rowTitleOnly}>ReDom Stars</Text><Text style={s.value}>{stars} Stars</Text><ChevronIcon width={22} height={22}/></Pressable>
    <View style={s.divider}/><Pressable onPress={()=>Alert.alert("Facebook Gaming","Not available in any region right now")} style={s.row}><View style={s.icon}><Text style={s.gamingIcon}>◉</Text></View><Text style={s.rowTitleOnly}>Facebook Gaming</Text><Text style={s.value}>$0.00</Text></Pressable>
   </View>
   <Text style={s.sectionTitle}>Shipping info</Text><View style={s.group}>
    <Pressable onPress={()=>navigation.navigate("PaymentAddresses")} style={s.row}><View style={s.flex}><Text style={s.rowTitle}>Shipping address</Text><Text style={s.rowValue}>{address?address.address_line1+", "+address.city:"Add a payment address"}</Text></View><ChevronIcon width={22} height={22}/></Pressable>
    <View style={s.divider}/><View style={s.row}><View style={s.flex}><Text style={s.rowTitle}>Email</Text><Text style={s.rowValue}>{user?.email||"Not connected"}</Text></View><ChevronIcon width={22} height={22}/></View>
    <View style={s.divider}/><View style={s.row}><View style={s.flex}><Text style={s.rowTitle}>Phone number</Text><Text style={s.rowValue}>{user?.phoneNumber||"Not connected"}</Text></View><ChevronIcon width={22} height={22}/></View>
   </View>
   <Text style={s.sectionTitle}>Settings</Text><View style={s.group}>
    <Pressable onPress={()=>navigation.navigate("PaymentSecurity")} style={s.row}><View style={s.icon}><SecurityIcon width={32} height={32}/></View><Text style={s.rowTitleOnly}>Security</Text><ChevronIcon width={22} height={22}/></Pressable>
    <View style={s.divider}/><Pressable onPress={()=>navigation.navigate("PaymentCurrency",{selectedCurrency:currency})} style={s.row}><View style={s.icon}><SettingsIcon width={32} height={32}/></View><View style={s.flex}><Text style={s.rowTitle}>Currency</Text><Text style={s.rowValue}>{currency}</Text></View><ChevronIcon width={22} height={22}/></Pressable>
    <View style={s.divider}/><Pressable onPress={()=>navigation.navigate("MetaPaySupport")} style={s.row}><View style={s.icon}><Text style={s.helpIcon}>?</Text></View><Text style={s.rowTitleOnly}>Help</Text><ChevronIcon width={22} height={22}/></Pressable>
    <View style={s.divider}/><Pressable onPress={()=>navigation.navigate("Policy",{slug:"payments"})} style={s.row}><View style={s.icon}><Text style={s.helpIcon}>▤</Text></View><Text style={s.rowTitleOnly}>Terms and privacy</Text><ChevronIcon width={22} height={22}/></Pressable>
   </View>
   {!loading&&methods.length<3&&<><Text style={s.sectionTitle}>Add payment method to your ReDom Pay account</Text><View style={s.group}><Pressable onPress={()=>navigation.navigate("AddPaymentMethod")} style={s.row}><View style={s.icon}><AddPaymentIcon width={32} height={32}/></View><Text style={s.rowTitleOnly}>Add Credit or Debit Card</Text><ChevronIcon width={22} height={22}/></Pressable></View></>}
   <Text style={s.sectionTitle}>More payment settings</Text><View style={s.group}><Pressable onPress={()=>Alert.alert("More payment settings","Coming Soon!")} style={s.row}><View style={s.icon}><SettingsIcon width={32} height={32}/></View><Text style={s.rowTitleOnly}>More payment settings</Text><ChevronIcon width={22} height={22}/></Pressable></View>
 </ScrollView>;
 if(embedded)return <>{content}<Modal transparent visible={backupSheet} animationType="slide" onRequestClose={()=>setBackupSheet(false)}>{backupModal()}</Modal></>;
 return <View style={s.root}>{content}<Modal transparent visible={backupSheet} animationType="slide" onRequestClose={()=>setBackupSheet(false)}>{backupModal()}</Modal></View>;
 function backupModal(){return <View style={s.modalBackdrop}><View style={s.sheet}><View style={s.sheetHandle}/><Text style={s.sheetTitle}>Backup payment methods</Text><Text style={s.sheetText}>Backup Payment Method is meant to keep your subscription or products active & running even if card A failed.</Text><Pressable onPress={()=>setPendingBackup(v=>!v)} style={s.toggleRow}><Text style={s.toggleLabel}>{pendingBackup?"On":"Off"}</Text><View style={[s.toggle,pendingBackup&&s.toggleOn]}><View style={[s.knob,pendingBackup&&s.knobOn]}/></View></Pressable><View style={s.sheetActions}><Pressable onPress={()=>setBackupSheet(false)} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable><Pressable onPress={()=>void saveBackup()} style={s.confirm}><Text style={s.confirmText}>Save</Text></Pressable></View></View></View>;}
}
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:"#fff"},content:{paddingHorizontal:31,paddingBottom:55,paddingTop:8},description:{fontSize:17,lineHeight:25,color:"#65676B",marginBottom:7},learn:{color:blue,fontSize:16,fontWeight:"700",marginBottom:18},sectionTitle:{fontSize:25,fontWeight:"800",lineHeight:31,color:"#050505",marginTop:25,marginBottom:12},group:{borderWidth:1,borderColor:"#DADDE1",borderRadius:18,overflow:"hidden",backgroundColor:"#fff"},loading:{padding:28,color:"#65676B"},empty:{alignItems:"center",padding:28},emptyTitle:{fontSize:22,fontWeight:"800",marginTop:10},emptyText:{fontSize:16,lineHeight:23,color:"#65676B",textAlign:"center",marginTop:7},primary:{marginTop:18,backgroundColor:blue,minHeight:52,borderRadius:27,paddingHorizontal:25,alignItems:"center",justifyContent:"center"},primaryText:{color:"#fff",fontSize:17,fontWeight:"800"},manageEntry:{minHeight:86,paddingHorizontal:18,flexDirection:"row",alignItems:"center"},methodRow:{minHeight:84,paddingHorizontal:18,flexDirection:"row",alignItems:"center"},brand:{width:65},methodName:{fontSize:18,fontWeight:"700"},status:{fontSize:14,marginTop:4,fontWeight:"600"},active:{color:"#65676B"},unavailable:{color:"#B42318"},suspended:{color:"#B54708"},divider:{height:1,backgroundColor:"#DADDE1",marginLeft:18},row:{minHeight:78,paddingHorizontal:18,paddingVertical:13,flexDirection:"row",alignItems:"center"},icon:{width:50,alignItems:"flex-start"},flex:{flex:1},rowTitle:{fontSize:17,fontWeight:"700",color:"#1C1E21"},rowTitleOnly:{flex:1,fontSize:17,fontWeight:"700",color:"#1C1E21"},rowValue:{fontSize:15,color:"#65676B",marginTop:3},rowDescription:{fontSize:14,lineHeight:20,color:"#65676B",marginTop:5},value:{fontSize:17,color:"#65676B",marginRight:8},gamingIcon:{fontSize:28,color:"#1C1E21"},helpIcon:{fontSize:27,color:"#1C1E21",fontWeight:"700"},modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,.5)",justifyContent:"flex-end"},sheet:{backgroundColor:"#fff",borderTopLeftRadius:28,borderTopRightRadius:28,padding:22,paddingBottom:34},sheetHandle:{width:40,height:4,borderRadius:3,backgroundColor:"#DADDE1",alignSelf:"center",marginBottom:20},sheetTitle:{fontSize:24,fontWeight:"800"},sheetText:{fontSize:16,lineHeight:23,color:"#65676B",marginTop:9},toggleRow:{marginTop:22,borderWidth:1,borderColor:"#DADDE1",borderRadius:14,padding:15,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},toggleLabel:{fontSize:17,fontWeight:"700"},toggle:{width:50,height:30,borderRadius:15,backgroundColor:"#DADDE1",padding:3},toggleOn:{backgroundColor:blue},knob:{width:24,height:24,borderRadius:12,backgroundColor:"#fff"},knobOn:{alignSelf:"flex-end"},sheetActions:{flexDirection:"row",gap:12,marginTop:20},cancel:{flex:1,height:50,borderRadius:25,alignItems:"center",justifyContent:"center",backgroundColor:"#F0F2F5"},cancelText:{fontSize:16,fontWeight:"700"},confirm:{flex:1,height:50,borderRadius:25,alignItems:"center",justifyContent:"center",backgroundColor:blue},confirmText:{fontSize:16,fontWeight:"700",color:"#fff"}
});
