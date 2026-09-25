
import React,{useCallback,useEffect,useState}from"react";
import{SafeAreaView,View,Text,Pressable,StyleSheet,TextInput,ActivityIndicator,Alert,Linking}from"react-native";
import{useNavigation,useRoute}from"@react-navigation/native";
import{useTheme}from"../theme/ThemeProvider";
import BackIcon from"../assets/navigation/back.svg";
import{ordersPaymentsService}from"../services/ordersPaymentsService";
import type{StarPackage}from"../services/ordersPaymentsService";

export function StarsCheckoutScreen(){
 const n=useNavigation<any>();const route=useRoute<any>();const{colors}=useTheme();
 const countryCode=String(route.params.countryCode);const packageKey=String(route.params.packageKey);
 const[email,setEmail]=useState("");const[pin,setPin]=useState("");const[pinEnabled,setPinEnabled]=useState(false);
 const[pkg,setPkg]=useState<StarPackage|null>(null);const[loading,setLoading]=useState(true);
 const[paying,setPaying]=useState(false);const[processing,setProcessing]=useState(false);
 const[result,setResult]=useState<"success"|"failed"|null>(null);const[errorMessage,setErrorMessage]=useState("");const[reference,setReference]=useState<string|null>(null);

 useEffect(()=>{(async()=>{try{const[catalog,settings]=await Promise.all([ordersPaymentsService.starsCatalog(countryCode),ordersPaymentsService.getSettings()]);setPkg(catalog.packages.find(x=>x.key===packageKey)||null);setPinEnabled(Boolean(settings.settings.pin_enabled));}catch(e){Alert.alert("ReDom Pay",e instanceof Error?e.message:"Unable to load this Stars package.")}finally{setLoading(false)}})()},[countryCode,packageKey]);

 const verifyAndResolve=useCallback(async(ref:string)=>{
   setReference(ref);setProcessing(true);setErrorMessage("");
   for(let attempt=0;attempt<24;attempt+=1){
     try{
       const r=await ordersPaymentsService.verifyPayment(ref);const st=String(r.payment.status);
       if(st==="paid"){setResult("success");setProcessing(false);return}
       if(["failed","abandoned","reversed"].includes(st)){setResult("failed");setErrorMessage("The payment could not be completed. You can retry from this ReDom Pay checkout.");setProcessing(false);return}
     }catch(e){
       if(attempt===23){setResult("failed");setErrorMessage("We could not complete verification. If your bank or provider shows the payment as successful, do not pay again; ReDom will reconcile the payment.");setProcessing(false);return}
     }
     if(attempt<23)await new Promise(resolve=>setTimeout(resolve,5000));
   }
 },[]);

 useEffect(()=>{
   const handleUrl=({url}:{url:string})=>{
     if(!url.startsWith("redom://payment/callback"))return;
     const match=url.match(/[?&]reference=([^&]+)/);const ref=match?decodeURIComponent(match[1]):reference;
     if(ref)void verifyAndResolve(ref);
   };
   const sub=Linking.addEventListener("url",handleUrl);
   void Linking.getInitialURL().then(url=>{if(url?.startsWith("redom://payment/callback")){const match=url.match(/[?&]reference=([^&]+)/);const ref=match?decodeURIComponent(match[1]):reference;if(ref)void verifyAndResolve(ref)}}).catch(()=>undefined);
   return()=>sub.remove();
 },[reference,verifyAndResolve]);

 const initialize=useCallback(async(channel?:"card"|"bank_transfer")=>{
   if(!pkg)return;
   const cleanEmail=email.trim();
   if(!cleanEmail)return Alert.alert("Transaction email","Enter the email address for this payment.");
   if(!/^\S+@\S+\.\S+$/.test(cleanEmail))return Alert.alert("Transaction email","Enter a valid email address.");
   if(pinEnabled&&!/^\\d{4,8}$/.test(pin))return Alert.alert("Payment PIN","Enter your 4 to 8 digit payment PIN.");
   setPaying(true);setResult(null);setErrorMessage("");
   try{
     const r=await ordersPaymentsService.initializeStars({packageKey,countryCode,email:cleanEmail,pin:pinEnabled?pin:undefined,preferredChannel:channel});
     setReference(r.reference);
     if(!r.checkoutUrl)throw new Error("ReDom Pay did not receive a secure provider checkout URL.");
     await Linking.openURL(r.checkoutUrl);
   }catch(e){setErrorMessage(e instanceof Error?e.message:"Unable to start ReDom Pay.");setResult("failed")}finally{setPaying(false)}
 },[pkg,email,pin,pinEnabled,countryCode,packageKey]);

 useEffect(()=>{if(result==="success"){const timer=setTimeout(()=>n.navigate("StarsActivity",{refresh:Date.now()}),1400);return()=>clearTimeout(timer)}},[result,n]);

 if(loading)return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}><ActivityIndicator style={{marginTop:50}} color={colors.primary}/></SafeAreaView>;

 if(result==="success")return <SafeAreaView style={[s.root,s.center,{backgroundColor:colors.background}]}>
   <View style={[s.resultCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>
    <Text style={s.successIcon}>✓</Text><Text style={[s.resultTitle,{color:colors.text}]}>Payment successful</Text>
    <Text style={[s.resultText,{color:colors.textSecondary}]}>You have been successfully credited <Text style={{fontWeight:"900",color:colors.text}}>{pkg?.stars.toLocaleString()} ReDom Stars</Text>.</Text>
    <Text style={[s.muted,{color:colors.textSecondary}]}>Returning to your Stars balance…</Text>
   </View>
 </SafeAreaView>;

 if(result==="failed")return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
   <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>{setResult(null);setErrorMessage("")}}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>ReDom Pay</Text></View>
   <View style={s.center}>
    <View style={[s.resultCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>
     <Text style={s.failIcon}>!</Text><Text style={[s.resultTitle,{color:colors.text}]}>Payment needs attention</Text>
     <Text style={[s.resultText,{color:colors.textSecondary}]}>{errorMessage||"We couldn't complete this payment."}</Text>
     <Pressable onPress={()=>void initialize()} style={[s.button,{backgroundColor:colors.primary}]}><Text style={s.buttonText}>Retry Payment</Text></Pressable>
     <Pressable onPress={()=>void initialize("bank_transfer")} style={[s.secondaryButton,{borderColor:colors.border}]}><Text style={[s.secondaryText,{color:colors.text}]}>Use Bank Transfer</Text></Pressable>
    </View>
   </View>
 </SafeAreaView>;

 return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
  <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>n.goBack()}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>ReDom Pay</Text></View>
  <View style={s.content}>
   <View style={[s.summary,{backgroundColor:colors.surface,borderColor:colors.border}]}>
    <Text style={[s.eyebrow,{color:colors.textSecondary}]}>REDom PAY CHECKOUT</Text>
    <Text style={[s.heading,{color:colors.text}]}>{pkg?String(pkg.stars)+" ReDom Stars":"ReDom Stars"}</Text>
    <Text style={[s.price,{color:colors.text}]}>{pkg?.localAmountFormatted}</Text>
    <Text style={[s.muted,{color:colors.textSecondary}]}>This is ReDom's custom checkout. Your payment is securely processed by our payment provider after you continue.</Text>
   </View>
   <Text style={[s.label,{color:colors.text}]}>Transaction email</Text>
   <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={colors.textSecondary} style={[s.input,{color:colors.text,borderColor:colors.border,backgroundColor:colors.surface}]}/>
   {pinEnabled?<><Text style={[s.label,{color:colors.text}]}>Payment PIN</Text><TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={8} placeholder="Enter your PIN" placeholderTextColor={colors.textSecondary} style={[s.input,{color:colors.text,borderColor:colors.border,backgroundColor:colors.surface}]}/></>:null}
   <View style={[s.secure,{borderColor:colors.border,backgroundColor:colors.surface}]}><Text style={[s.secureTitle,{color:colors.text}]}>Secure payment</Text><Text style={[s.muted,{color:colors.textSecondary,marginTop:3}]}>ReDom creates and tracks your transaction. Card authentication, bank-transfer processing and provider security are handled by the payment provider.</Text></View>
   <Pressable disabled={paying||!pkg||pkg.payable===false} onPress={()=>void initialize()} style={[s.button,{backgroundColor:paying||!pkg||pkg.payable===false?colors.border:colors.primary}]}><Text style={s.buttonText}>{paying?"Starting ReDom Pay…":"Continue to payment"}</Text></Pressable>
   {pkg?.availabilityReason?<Text style={[s.muted,{color:colors.textSecondary,marginTop:10}]}>{pkg.availabilityReason}</Text>:null}
   {reference?<Text style={[s.reference,{color:colors.textSecondary}]}>Transaction reference: {reference}</Text>:null}
  </View>
 </SafeAreaView>
}

const s=StyleSheet.create({root:{flex:1},center:{alignItems:"center",justifyContent:"center",padding:20},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14},title:{fontSize:19,fontWeight:"800",marginLeft:12},content:{padding:20},summary:{borderWidth:1,borderRadius:18,padding:20},eyebrow:{fontSize:11,fontWeight:"900",letterSpacing:1},heading:{fontSize:24,fontWeight:"900",marginTop:7},price:{fontSize:28,fontWeight:"900",marginTop:6},label:{fontSize:16,fontWeight:"800",marginTop:22,marginBottom:8},input:{height:54,borderWidth:1,borderRadius:13,paddingHorizontal:15,fontSize:16},muted:{fontSize:14,lineHeight:20,marginTop:9},secure:{borderWidth:1,borderRadius:14,padding:15,marginTop:20},secureTitle:{fontSize:15,fontWeight:"900"},button:{height:56,borderRadius:28,alignItems:"center",justifyContent:"center",marginTop:24},buttonText:{color:"#fff",fontSize:17,fontWeight:"900"},secondaryButton:{height:54,borderRadius:27,borderWidth:1,alignItems:"center",justifyContent:"center",marginTop:10},secondaryText:{fontSize:16,fontWeight:"800"},resultCard:{width:"100%",maxWidth:430,borderWidth:1,borderRadius:22,padding:24,alignItems:"center"},successIcon:{width:64,height:64,borderRadius:32,textAlign:"center",textAlignVertical:"center",fontSize:42,fontWeight:"900",color:"#16a34a",marginBottom:14},failIcon:{width:64,height:64,borderRadius:32,textAlign:"center",textAlignVertical:"center",fontSize:40,fontWeight:"900",color:"#dc2626",marginBottom:14},resultTitle:{fontSize:25,fontWeight:"900"},resultText:{fontSize:16,lineHeight:24,textAlign:"center",marginTop:10},reference:{fontSize:12,marginTop:14,textAlign:"center"}});
