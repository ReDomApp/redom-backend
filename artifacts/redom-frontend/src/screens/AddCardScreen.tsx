import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Constants from "expo-constants";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { ordersPaymentsService } from "../services/ordersPaymentsService";
import CloseIcon from "../assets/navigation/close.svg";
import CheckIcon from "../assets/home-feed/checkmark.svg";

type Nav=NativeStackNavigationProp<RootStackParamList>;
const blue="#1877F2";
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

export function AddCardScreen(){
 const navigation=useNavigation<Nav>();
 const [opening,setOpening]=useState(false);
 const [processing,setProcessing]=useState(false);
 const [result,setResult]=useState<"success"|"failure"|null>(null);
 const [failure,setFailure]=useState("");
 const handledSession=useRef<string|null>(null);
 const expoGo=Constants.appOwnership==="expo";
 const hostUri=(Constants.expoConfig as any)?.hostUri as string|undefined;
 const returnUrl=expoGo&&hostUri?"exp://"+hostUri+"/--/payment-method-setup":"redom://payment-method-setup";

 const openStripeCheckout=async()=>{
   setOpening(true);
   setFailure("");
   try{
     const r=await ordersPaymentsService.setupStripePaymentMethodCheckout({
       name:"ReDom Pay Cardholder",
       returnUrl,
       cancelUrl:returnUrl,
     });
     if(!r?.checkoutUrl)throw new Error("Stripe did not return a secure Checkout URL.");
     await Linking.openURL(r.checkoutUrl);
   }catch(e){
     setOpening(false);
     setFailure(e instanceof Error?e.message:"Unable to open Stripe Checkout.");
     setResult("failure");
   }
 };

 useEffect(()=>{
   let active=true;
   const handleReturn=async(url:string)=>{
     if(!url.includes("payment-method-setup"))return false;
     const sessionMatch=url.match(/[?&]session_id=([^&]+)/);
     const cancelled=/[?&]status=cancelled(?:&|$)/.test(url);
     if(cancelled){
       if(active){
         setOpening(false);
         setProcessing(false);
         setFailure("Stripe Checkout was cancelled. No card was saved.");
         setResult("failure");
       }
       return true;
     }
     if(!sessionMatch)return true;
     const sessionId=decodeURIComponent(sessionMatch[1]);
     if(handledSession.current===sessionId)return true;
     handledSession.current=sessionId;
     setOpening(false);
     setProcessing(true);
     setResult(null);
     setFailure("");
     const started=Date.now();
     try{
       const r=await ordersPaymentsService.finalizeStripePaymentMethodCheckout(sessionId);
       if(!r.success||r.status!=="succeeded")throw new Error("ReDom Pay could not complete the secure card save.");
       if(Date.now()-started<10000)await wait(10000-(Date.now()-started));
       if(active)setResult("success");
     }catch(e){
       if(Date.now()-started<10000)await wait(10000-(Date.now()-started));
       if(active){
         setFailure(e instanceof Error?e.message:"The card could not be saved.");
         setResult("failure");
       }
     }finally{
       if(active)setProcessing(false);
     }
     return true;
   };

   const sub=Linking.addEventListener("url",e=>{void handleReturn(e.url);});
   void (async()=>{
     const initial=await Linking.getInitialURL();
     if(!active)return;
     if(initial && await handleReturn(initial))return;
     await openStripeCheckout();
   })();
   return()=>{active=false;sub.remove();};
 },[]);

 if(result){
   return <SafeAreaView style={s.root}>
     <View style={s.result}>
       <View style={s.successIcon}>{result==="success"?<CheckIcon width={84} height={84}/>:<Text style={s.failMark}>!</Text>}</View>
       <Text style={s.resultTitle}>{result==="success"?"ReDom Pay Card Saved Successfully!":"Stripe Card Setup Unsuccessful"}</Text>
       <Text style={s.resultText}>{result==="success"?"Your card was securely saved with Stripe and is now available in ReDom Pay.":failure||"The card could not be saved. Please try again."}</Text>
       <Pressable onPress={()=>result==="success"?navigation.pop(2):setResult(null)} style={s.primary}>
         <Text style={s.primaryText}>{result==="success"?"Ok, Continue":"Try Again"}</Text>
       </Pressable>
     </View>
   </SafeAreaView>;
 }

 return <SafeAreaView style={s.root}>
   <View style={s.header}>
     <Pressable onPress={()=>navigation.goBack()} style={s.close}><CloseIcon width={28} height={28}/></Pressable>
   </View>
   <View style={s.content}>
     <Text style={s.title}>Add card</Text>
     <Text style={s.subtitle}>Your card details are collected directly by Stripe's secure Checkout and are never entered into or stored by ReDom.</Text>
     <View style={s.checkoutCard}>
       <Text style={s.checkoutTitle}>Secure Stripe Checkout</Text>
       <Text style={s.checkoutText}>Stripe will securely collect your card number, expiration date, CVC and required billing information. After successful verification, ReDom Pay will save the Stripe payment method and return you to the app.</Text>
       <Text style={s.checkoutNote}>ReDom Pay does not receive or store your raw card number or CVC.</Text>
       <Pressable disabled={opening||processing} onPress={()=>void openStripeCheckout()} style={[s.primary,(opening||processing)&&s.disabled]}>
         {opening||processing?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>Continue to Stripe Checkout</Text>}
       </Pressable>
     </View>
   </View>
   {(opening||processing)&&<View style={s.processing}>
     <View style={s.processingCard}>
       <ActivityIndicator size="large" color={blue}/>
       <Text style={s.processingText}>{opening?"Opening Stripe Checkout.....":"Saving Card With ReDom Pay....."}</Text>
       <Text style={s.processingSub}>{opening?"Complete the secure card setup on Stripe.":"Please wait while ReDom Pay confirms the successful Stripe card setup."}</Text>
     </View>
   </View>}
 </SafeAreaView>;
}

const s=StyleSheet.create({
 root:{flex:1,backgroundColor:"#fff"},
 header:{height:62,paddingHorizontal:24,justifyContent:"center"},
 close:{width:42,height:42,justifyContent:"center",alignItems:"flex-start"},
 content:{paddingHorizontal:30,paddingTop:8},
 title:{fontSize:32,fontWeight:"800",color:"#050505",marginTop:6},
 subtitle:{fontSize:17,lineHeight:25,color:"#65676B",marginTop:8,marginBottom:24},
 checkoutCard:{borderWidth:1,borderColor:"#DADDE1",borderRadius:22,padding:22,backgroundColor:"#F7F8FA"},
 checkoutTitle:{fontSize:21,fontWeight:"800",color:"#1C1E21"},
 checkoutText:{fontSize:16,lineHeight:24,color:"#65676B",marginTop:10},
 checkoutNote:{fontSize:14,lineHeight:21,color:"#1C1E21",marginTop:14,marginBottom:20,fontWeight:"600"},
 primary:{minHeight:54,borderRadius:28,backgroundColor:blue,alignItems:"center",justifyContent:"center",paddingHorizontal:22},
 disabled:{backgroundColor:"#8EB5F5"},
 primaryText:{color:"#fff",fontSize:17,fontWeight:"800"},
 processing:{position:"absolute",left:0,right:0,top:0,bottom:0,backgroundColor:"rgba(255,255,255,.94)",alignItems:"center",justifyContent:"center"},
 processingCard:{width:"84%",padding:30,borderRadius:22,borderWidth:1,borderColor:"#DADDE1",alignItems:"center",backgroundColor:"#fff"},
 processingText:{fontSize:22,fontWeight:"800",marginTop:20,textAlign:"center"},
 processingSub:{fontSize:15,lineHeight:22,color:"#65676B",textAlign:"center",marginTop:10},
 result:{flex:1,alignItems:"center",justifyContent:"center",padding:30},
 successIcon:{width:110,height:110,borderRadius:55,alignItems:"center",justifyContent:"center",marginBottom:24},
 failMark:{fontSize:74,fontWeight:"900",color:"#B42318"},
 resultTitle:{fontSize:27,fontWeight:"800",textAlign:"center"},
 resultText:{fontSize:16,lineHeight:24,color:"#65676B",textAlign:"center",marginTop:12,marginBottom:26}
});
