import React,{useEffect,useState}from"react";
import{SafeAreaView,View,Text,Pressable,StyleSheet,ActivityIndicator,Alert,Linking}from"react-native";
import{useNavigation}from"@react-navigation/native";
import{useTheme}from"../theme/ThemeProvider";
import BackIcon from"../assets/navigation/back.svg";
import{ordersPaymentsService}from"../services/ordersPaymentsService";

export function AddPaymentMethodScreen(){
 const n=useNavigation<any>();const{colors}=useTheme();const[loading,setLoading]=useState(false);const[reference,setReference]=useState<string|null>(null);
 useEffect(()=>{const sub=Linking.addEventListener("url",({url})=>{if(!url.startsWith("redom://payment/callback"))return;const m=url.match(/[?&]reference=([^&]+)/);const ref=m?decodeURIComponent(m[1]):reference;if(!ref)return;setReference(ref);void ordersPaymentsService.verifyPayment(ref).then(result=>{if(result.payment.status==="paid" && result.payment.paymentMethodSaved){Alert.alert("Payment method added","Your card was verified successfully. The $1 equivalent verification charge was submitted for immediate refund.",[{text:"OK",onPress:()=>n.goBack()}]);}else if(result.payment.status==="paid"){Alert.alert("Card not saved","The card payment was successful, but ReDom could not complete the verification refund. The card was not saved. Please try again.",[{text:"OK"}]);}else Alert.alert("Payment method","Card verification did not complete. The card was not saved.",[{text:"OK"}]);}).catch(e=>Alert.alert("Payment method",e instanceof Error?e.message:"Unable to verify card setup."));});return()=>sub.remove()},[n,reference]);
 const add=async()=>{setLoading(true);try{const r=await ordersPaymentsService.setupPaymentMethod();setReference(r.reference);await Linking.openURL(r.checkoutUrl);}catch(e){Alert.alert("Payment method",e instanceof Error?e.message:"Unable to start secure card setup.");}finally{setLoading(false)}};
 return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
  <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>n.goBack()}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>Add payment method</Text><View style={{width:24}}/></View>
  <View style={s.content}>
   <Text style={[s.heading,{color:colors.text}]}>Add a card securely</Text>
   <Text style={[s.copy,{color:colors.textSecondary}]}>ReDom sends you to Paystack's secure checkout. Your card number and CVV are entered only in the provider checkout and are not stored by ReDom.</Text>
   <Text style={[s.copy,{color:colors.textSecondary}]}>A temporary charge equal to USD $1.00 in your selected payment currency is required to authenticate the card. ReDom immediately submits that verification charge for refund after the provider confirms the payment. The card is saved only after the verification refund has been successfully submitted.</Text>
   <Pressable disabled={loading} onPress={()=>void add()} style={[s.button,{backgroundColor:loading?colors.border:colors.primary}]}><Text style={s.buttonText}>{loading?"Opening secure checkout…":"Continue to secure checkout"}</Text></Pressable>
  </View>
 </SafeAreaView>
}
const s=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14},title:{fontSize:19,fontWeight:"800",marginLeft:12},content:{padding:24},heading:{fontSize:26,fontWeight:"900"},copy:{fontSize:16,lineHeight:24,marginTop:15},button:{marginTop:28,height:56,borderRadius:28,alignItems:"center",justifyContent:"center"},buttonText:{color:"#fff",fontSize:16,fontWeight:"800"}});
