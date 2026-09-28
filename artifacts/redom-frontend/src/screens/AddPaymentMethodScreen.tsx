import { Alert, Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import CloseIcon from "../assets/navigation/close.svg";
import AddPaymentIcon from "../assets/home-feed/add-payment-method.svg";
import PaymentIcon from "../assets/payment/paypal.svg";
import BankIcon from "../assets/payment/bank-payment.svg";
import ChevronIcon from "../assets/home-feed/chevron-right.svg";

type Nav=NativeStackNavigationProp<RootStackParamList>;
const blue="#1877F2";

export function AddPaymentMethodScreen(){
 const navigation=useNavigation<Nav>();
 return <SafeAreaView style={s.root}><View style={s.backdrop}><Pressable style={s.dismissArea} onPress={()=>navigation.goBack()}/><View style={s.sheet}>
  <Pressable onPress={()=>navigation.goBack()} style={s.close}><CloseIcon width={28} height={28}/></Pressable>
  <Text style={s.title}>Add a payment method</Text>
  <Text style={s.subtitle}>Choose how you'd like to securely save a payment method with ReDom Pay.</Text>
  <View style={s.group}>
   <Pressable onPress={()=>navigation.navigate("AddCard")} style={({pressed})=>[s.option,pressed&&s.pressed]}><View style={s.icon}><AddPaymentIcon width={38} height={38}/></View><Text style={s.optionText}>Credit or debit card</Text><ChevronIcon width={22} height={22}/></Pressable>
   <View style={s.divider}/>
   <Pressable onPress={()=>Alert.alert("PayPal","Coming Soon!")} style={({pressed})=>[s.option,pressed&&s.pressed]}><View style={s.icon}><PaymentIcon width={38} height={38}/></View><Text style={s.optionText}>PayPal</Text><ChevronIcon width={22} height={22}/></Pressable>
   <View style={s.divider}/>
   <Pressable onPress={()=>Alert.alert("Bank Payment Method","Under Development!")} style={({pressed})=>[s.option,pressed&&s.pressed]}><View style={s.icon}><BankIcon width={38} height={38}/></View><Text style={s.optionText}>Bank Payment Method</Text><ChevronIcon width={22} height={22}/></Pressable>
  </View>
  <Text style={s.policy}>This information will be saved with ReDom Pay and synced in Accounts Center, where it can be managed. <Text style={s.learn} onPress={()=>navigation.navigate("Policy",{slug:"payments"})}>Learn more</Text></Text>
 </View></View></SafeAreaView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:"transparent"},backdrop:{flex:1,backgroundColor:"rgba(0,0,0,.52)",justifyContent:"flex-end"},dismissArea:{flex:1},sheet:{backgroundColor:"#fff",borderTopLeftRadius:28,borderTopRightRadius:28,paddingHorizontal:24,paddingTop:12,paddingBottom:28},close:{width:42,height:42,justifyContent:"center",alignItems:"flex-start"},title:{fontSize:29,fontWeight:"800",color:"#050505",marginTop:8},subtitle:{fontSize:16,lineHeight:23,color:"#65676B",marginTop:8,marginBottom:20},group:{borderWidth:1,borderColor:"#DADDE1",borderRadius:18,overflow:"hidden"},option:{minHeight:72,paddingHorizontal:17,flexDirection:"row",alignItems:"center"},icon:{width:54,alignItems:"flex-start"},optionText:{flex:1,fontSize:17,fontWeight:"700",color:"#1C1E21"},divider:{height:1,backgroundColor:"#DADDE1",marginLeft:17},pressed:{opacity:.55},policy:{fontSize:14,lineHeight:21,color:"#65676B",marginTop:19},learn:{color:blue,fontWeight:"700"}});
