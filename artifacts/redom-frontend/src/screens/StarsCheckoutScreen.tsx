
import React,{useCallback,useEffect,useRef,useState}from"react";
import{SafeAreaView,View,Text,Pressable,StyleSheet,TextInput,ActivityIndicator,Alert}from"react-native";
import{useNavigation,useRoute}from"@react-navigation/native";
import{WebView}from"react-native-webview";
import{useTheme}from"../theme/ThemeProvider";
import BackIcon from"../assets/navigation/back.svg";
import{ordersPaymentsService}from"../services/ordersPaymentsService";
import type{StarPackage}from"../services/ordersPaymentsService";

const PAYSTACK_CALLBACK_PREFIX="https://redom-backend.onrender.com/redom-backend/payments/callback";

export function StarsCheckoutScreen(){
 const n=useNavigation<any>();const route=useRoute<any>();const{colors}=useTheme();
 const countryCode=String(route.params.countryCode);const packageKey=String(route.params.packageKey);
 const[email,setEmail]=useState("");const[pin,setPin]=useState("");const[pinEnabled,setPinEnabled]=useState(false);
 const[pkg,setPkg]=useState<StarPackage|null>(null);const[loading,setLoading]=useState(true);
 const[checkoutUrl,setCheckoutUrl]=useState<string|null>(null);const[reference,setReference]=useState<string|null>(null);
 const[paying,setPaying]=useState(false);const[processing,setProcessing]=useState(false);
 const[result,setResult]=useState<"success"|"failed"|null>(null);const[errorMessage,setErrorMessage]=useState("");
 const webRef=useRef<WebView>(null);const mounted=useRef(true);

 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>{(async()=>{try{const[catalog,settings]=await Promise.all([ordersPaymentsService.starsCatalog(countryCode),ordersPaymentsService.getSettings()]);setPkg(catalog.packages.find(x=>x.key===packageKey)||null);setPinEnabled(Boolean(settings.settings.pin_enabled));}catch(e){Alert.alert("ReDom Pay",e instanceof Error?e.message:"Unable to load this Stars package.")}finally{if(mounted.current)setLoading(false)}})()},[countryCode,packageKey]);

 const verifyAndResolve=useCallback(async(ref:string)=>{
   if(!mounted.current)return;
   setProcessing(true);setErrorMessage("");
   for(let attempt=0;attempt<24;attempt+=1){
     try{
       const r=await ordersPaymentsService.verifyPayment(ref);const st=String(r.payment.status);
       if(st==="paid"){setResult("success");setProcessing(false);return}
       if(["failed","abandoned","reversed"].includes(st)){setResult("failed");setErrorMessage("The payment could not be completed. Please retry with another payment method or use Bank Transfer.");setProcessing(false);return}
       if(attempt<23)await new Promise(resolve=>setTimeout(resolve,5000));
     }catch(e){
       if(attempt===23){setResult("failed");setErrorMessage("We could not complete verification. If your bank or Paystack shows the payment as successful, do not pay again; ReDom will reconcile the payment.");setProcessing(false);return}
       await new Promise(resolve=>setTimeout(resolve,5000));
     }
   }
 },[]);

 const initialize=useCallback(async(channel?:"card"|"bank_transfer")=>{
   if(!pkg)return;
   const cleanEmail=email.trim();
   if(!cleanEmail)return Alert.alert("Transaction email","Enter the email address for this payment.");
   if(!/^\S+@\S+\.\S+$/.test(cleanEmail))return Alert.alert("Transaction email","Enter a valid email address.");
   if(pinEnabled&&!/^\d{4,8}$/.test(pin))return Alert.alert("Payment PIN","Enter your 4 to 8 digit payment PIN.");
   setPaying(true);setResult(null);setErrorMessage("");setCheckoutUrl(null);
   try{
     const r=await ordersPaymentsService.initializeStars({packageKey,countryCode,email:cleanEmail,pin:pinEnabled?pin:undefined,preferredChannel:channel});
     setReference(r.reference);setCheckoutUrl(r.checkoutUrl);
   }catch(e){setErrorMessage(e instanceof Error?e.message:"Unable to initialize payment.");setResult("failed")}finally{if(mounted.current)setPaying(false)}
 },[pkg,email,pin,pinEnabled,countryCode,packageKey]);

 const handleNavigation=useCallback((request:any)=>{
   const url=String(request?.url||"");
   if(url.startsWith(PAYSTACK_CALLBACK_PREFIX)||url.startsWith("redom://payment/callback")){
     const match=url.match(/[?&]reference=([^&]+)/);const ref=match?decodeURIComponent(match[1]):reference;
     if(ref){setCheckoutUrl(null);void verifyAndResolve(ref)}
     return false;
   }
   if(url.startsWith("https://standard.paystack.co/close"))return false;
   return true;
 },[reference,verifyAndResolve]);

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
   <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>n.goBack()}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>ReDom Pay</Text></View>
   <View style={s.center}>
    <View style={[s.resultCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>
     <Text style={s.failIcon}>!</Text><Text style={[s.resultTitle,{color:colors.text}]}>Payment failed</Text>
     <Text style={[s.resultText,{color:colors.textSecondary}]}>{errorMessage||"We couldn't complete this payment."}</Text>
     <Text style={[s.muted,{color:colors.textSecondary}]}>A payment result has been sent to {email.trim()}.</Text>
     <Pressable onPress={()=>void initialize()} style={[s.button,{backgroundColor:colors.primary}]}><Text style={s.buttonText}>Try another payment method</Text></Pressable>
     <Pressable onPress={()=>void initialize("bank_transfer")} style={[s.secondaryButton,{borderColor:colors.border}]}><Text style={[s.secondaryText,{color:colors.text}]}>Try Bank Transfer</Text></Pressable>
    </View>
   </View>
 </SafeAreaView>;

 if(checkoutUrl)return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
   <View style={[s.gatewayHeader,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}>
    <Pressable disabled={processing} onPress={()=>setCheckoutUrl(null)}><BackIcon width={24} height={24}/></Pressable>
    <View style={{flex:1,marginLeft:12}}><Text style={[s.gatewayTitle,{color:colors.text}]}>ReDom Pay</Text><Text style={[s.gatewaySub,{color:colors.textSecondary}]}>{pkg?.stars.toLocaleString()} Stars · {pkg?.localAmountFormatted}</Text></View>
    {processing?<ActivityIndicator color={colors.primary}/>:null}
   </View>
   <View style={s.webWrap}>
    <WebView ref={webRef} source={{uri:checkoutUrl}} javaScriptEnabled domStorageEnabled setSupportMultipleWindows={false} originWhitelist={["https://*","http://*","redom://*"]} onShouldStartLoadWithRequest={handleNavigation} onError={()=>{setCheckoutUrl(null);setResult("failed");setErrorMessage("The secure payment screen could not be loaded. Please retry with another payment method or Bank Transfer.")}} startInLoadingState renderLoading={()=> <View style={s.webLoading}><ActivityIndicator size="large" color={colors.primary}/><Text style={[s.muted,{color:colors.textSecondary}]}>Opening secure payment…</Text></View>}/>
    {processing?<View style={s.processingOverlay}><ActivityIndicator size="large" color={colors.primary}/><Text style={[s.processingText,{color:colors.text}]}>Confirming your payment…</Text><Text style={[s.muted,{color:colors.textSecondary,textAlign:"center"}]}>Please wait. Do not send the transfer again.</Text></View>:null}
   </View>
 </SafeAreaView>;

 return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
  <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>n.goBack()}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>ReDom Pay</Text></View>
  <View style={s.content}>
   <View style={[s.summary,{backgroundColor:colors.surface,borderColor:colors.border}]}>
    <Text style={[s.eyebrow,{color:colors.textSecondary}]}>PAYMENT</Text><Text style={[s.heading,{color:colors.text}]}>{pkg?String(pkg.stars)+" ReDom Stars":"ReDom Stars"}</Text><Text style={[s.price,{color:colors.text}]}>{pkg?.localAmountFormatted}</Text>
    <Text style={[s.muted,{color:colors.textSecondary}]}>Paystack securely manages the payment screen, payment methods, authentication and provider processing inside ReDom.</Text>
   </View>
   <Text style={[s.label,{color:colors.text}]}>Email</Text>
   <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={colors.textSecondary} style={[s.input,{color:colors.text,borderColor:colors.border,backgroundColor:colors.surface}]}/>
   {pinEnabled?<><Text style={[s.label,{color:colors.text}]}>Payment PIN</Text><TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={8} placeholder="Enter your PIN" placeholderTextColor={colors.textSecondary} style={[s.input,{color:colors.text,borderColor:colors.border,backgroundColor:colors.surface}]}/></>:null}
   <Text style={[s.muted,{color:colors.textSecondary}]}>Any applicable Paystack transaction charges are calculated by Paystack at checkout.</Text>
   <Pressable disabled={paying||!pkg||pkg.payable===false} onPress={()=>void initialize()} style={[s.button,{backgroundColor:paying||!pkg||pkg.payable===false?colors.border:colors.primary}]}><Text style={s.buttonText}>{paying?"Starting secure payment…":"Pay "+(pkg?.localAmountFormatted??"")}</Text></Pressable>
   {pkg?.availabilityReason?<Text style={[s.muted,{color:colors.textSecondary,marginTop:10}]}>{pkg.availabilityReason}</Text>:null}
  </View>
 </SafeAreaView>
}

const s=StyleSheet.create({root:{flex:1},center:{alignItems:"center",justifyContent:"center",padding:20},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14},gatewayHeader:{height:68,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14},title:{fontSize:19,fontWeight:"800",marginLeft:12},gatewayTitle:{fontSize:18,fontWeight:"900"},gatewaySub:{fontSize:12,marginTop:2},content:{padding:20},summary:{borderWidth:1,borderRadius:18,padding:20},eyebrow:{fontSize:11,fontWeight:"900",letterSpacing:1},heading:{fontSize:24,fontWeight:"900",marginTop:7},price:{fontSize:28,fontWeight:"900",marginTop:6},label:{fontSize:16,fontWeight:"800",marginTop:22,marginBottom:8},input:{height:54,borderWidth:1,borderRadius:13,paddingHorizontal:15,fontSize:16},muted:{fontSize:14,lineHeight:20,marginTop:9},button:{height:56,borderRadius:28,alignItems:"center",justifyContent:"center",marginTop:24},buttonText:{color:"#fff",fontSize:17,fontWeight:"900"},secondaryButton:{height:54,borderRadius:27,borderWidth:1,alignItems:"center",justifyContent:"center",marginTop:10},secondaryText:{fontSize:16,fontWeight:"800"},webWrap:{flex:1},webLoading:{flex:1,alignItems:"center",justifyContent:"center"},processingOverlay:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(255,255,255,.94)",alignItems:"center",justifyContent:"center",padding:30},processingText:{fontSize:18,fontWeight:"900",marginTop:14},resultCard:{width:"100%",maxWidth:430,borderWidth:1,borderRadius:22,padding:24,alignItems:"center"},successIcon:{width:64,height:64,borderRadius:32,textAlign:"center",textAlignVertical:"center",fontSize:42,fontWeight:"900",color:"#16a34a",marginBottom:14},failIcon:{width:64,height:64,borderRadius:32,textAlign:"center",textAlignVertical:"center",fontSize:40,fontWeight:"900",color:"#dc2626",marginBottom:14},resultTitle:{fontSize:25,fontWeight:"900"},resultText:{fontSize:16,lineHeight:24,textAlign:"center",marginTop:10}});
