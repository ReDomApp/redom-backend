import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { ordersPaymentsService } from "../services/ordersPaymentsService";
import BackIcon from "../assets/navigation/back.svg";
import CartIcon from "../assets/home-feed/cart.svg";
import MenuIcon from "../assets/home-feed/menu.svg";
import StarsIcon from "../assets/home-feed/stars.svg";
import SubscriptionsIcon from "../assets/home-feed/subscriptions.svg";
import SecurityIcon from "../assets/home-feed/security-controls.svg";
import HelpIcon from "../assets/home-feed/help-support.svg";
import TermsIcon from "../assets/home-feed/terms-policies.svg";
import ChevronIcon from "../assets/home-feed/chevron-right.svg";
import ProfilePlaceholder from "../assets/home-feed/profile-placeholder.svg";

type Navigation=NativeStackNavigationProp<RootStackParamList>;
export function OrdersPaymentsScreen(){
 const navigation=useNavigation<Navigation>(); const [stars,setStars]=useState(0);
 useEffect(()=>{let active=true;ordersPaymentsService.starsActivity().then(r=>{if(active)setStars(Number(r.balance||0))}).catch(()=>undefined);return()=>{active=false}},[]);
 return <SafeAreaView style={s.root}>
  <View style={s.header}><Pressable onPress={()=>navigation.goBack()} style={s.headerButton} hitSlop={10}><BackIcon width={27} height={27}/></Pressable><Text style={s.headerTitle}>Orders and payments</Text><View style={s.headerActions}>
   <Pressable onPress={()=>navigation.navigate("Cart")} style={s.headerButton}><CartIcon width={29} height={29}/></Pressable>
   <Pressable style={s.headerButton} accessibilityLabel="Menu"><MenuIcon width={29} height={29}/></Pressable>
   <View style={s.avatar}><ProfilePlaceholder width={34} height={34}/></View>
  </View></View>
  <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
   <Pressable onPress={()=>navigation.navigate("ReDomPayTransactions",{tab:"transactions"})} style={s.payCard}>
    <View style={s.payBrand}><Text style={s.reDomMark}>R</Text><Text style={s.payTitle}>ReDom Pay</Text></View><Text style={s.payDescription}>Transactions, credit cards, debit cards, shipping info, PayPal</Text>
   </Pressable>
   <Text style={s.sectionTitle}>Balances</Text>
   <View style={s.group}><Pressable onPress={()=>navigation.navigate("StarsActivity")} style={s.row}><View style={s.icon}><StarsIcon width={34} height={34}/></View><Text style={s.rowLabel}>ReDom Stars</Text><Text style={s.value}>{stars} Stars</Text><ChevronIcon width={22} height={22}/></Pressable>
    <View style={s.divider}/><Pressable onPress={()=>navigation.navigate("BuyStars")} style={s.row}><View style={s.icon}><StarsIcon width={30} height={30}/></View><Text style={s.rowLabel}>Buy Stars</Text><ChevronIcon width={22} height={22}/></Pressable>
    <View style={s.divider}/><Pressable onPress={()=>navigation.navigate("StarsActivity")} style={s.row}><View style={s.icon}><StarsIcon width={30} height={30}/></View><Text style={s.rowLabel}>Stars activity</Text><ChevronIcon width={22} height={22}/></Pressable>
   </View>
   <Text style={s.sectionTitle}>Payment information</Text><View style={s.group}>
    <Pressable onPress={()=>navigation.navigate("Subscriptions")} style={s.row}><View style={s.icon}><SubscriptionsIcon width={34} height={34}/></View><Text style={s.rowLabel}>Subscriptions</Text><ChevronIcon width={22} height={22}/></Pressable>
   </View>
   <Text style={s.sectionTitle}>Settings</Text><View style={s.group}>
    <Pressable onPress={()=>navigation.navigate("PaymentSecurity")} style={s.row}><View style={s.icon}><SecurityIcon width={34} height={34}/></View><Text style={s.rowLabel}>Security and controls</Text><ChevronIcon width={22} height={22}/></Pressable>
    <View style={s.divider}/><Pressable onPress={()=>navigation.navigate("MetaPaySupport")} style={s.row}><View style={s.icon}><HelpIcon width={34} height={34}/></View><Text style={s.rowLabel}>Help</Text><ChevronIcon width={22} height={22}/></Pressable>
    <View style={s.divider}/><Pressable onPress={()=>navigation.navigate("Policy",{slug:"payments"})} style={s.row}><View style={s.icon}><TermsIcon width={34} height={34}/></View><Text style={s.rowLabel}>Terms and privacy</Text><ChevronIcon width={22} height={22}/></Pressable>
   </View>
  </ScrollView>
 </SafeAreaView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:"#fff"},header:{height:62,backgroundColor:"#fff",borderBottomWidth:1,borderBottomColor:"#E4E6EB",flexDirection:"row",alignItems:"center",paddingHorizontal:17},headerButton:{width:34,height:40,alignItems:"center",justifyContent:"center"},headerTitle:{flex:1,color:"#050505",fontSize:21,fontWeight:"800",marginLeft:12},headerActions:{flexDirection:"row",alignItems:"center",gap:6},avatar:{width:34,height:34,borderRadius:17,overflow:"hidden",alignItems:"center",justifyContent:"center",marginLeft:2},content:{paddingHorizontal:31,paddingTop:24,paddingBottom:45},payCard:{minHeight:153,borderRadius:18,backgroundColor:"#fff",borderWidth:1,borderColor:"#E1E3E6",paddingHorizontal:38,paddingVertical:31},payBrand:{flexDirection:"row",alignItems:"center"},reDomMark:{color:"#1877F2",fontSize:31,fontWeight:"900",marginRight:4},payTitle:{color:"#1C1E21",fontSize:25,fontWeight:"500"},payDescription:{color:"#1C1E21",fontSize:20,lineHeight:29,marginTop:18},sectionTitle:{color:"#050505",fontSize:25,lineHeight:31,fontWeight:"800",marginTop:31,marginBottom:13},group:{borderWidth:1,borderColor:"#DADDE1",borderRadius:18,overflow:"hidden",backgroundColor:"#fff"},row:{minHeight:70,paddingHorizontal:18,paddingVertical:8,flexDirection:"row",alignItems:"center"},icon:{width:50,alignItems:"flex-start",justifyContent:"center"},rowLabel:{flex:1,color:"#050505",fontSize:19,fontWeight:"600"},value:{color:"#65676B",fontSize:17,marginRight:8},divider:{height:1,backgroundColor:"#DADDE1",marginLeft:18}});
