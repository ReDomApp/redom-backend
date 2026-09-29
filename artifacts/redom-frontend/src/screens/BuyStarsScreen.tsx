import React,{useCallback,useEffect,useMemo,useState}from"react";
import{ActivityIndicator,Linking,Modal,Pressable,ScrollView,StyleSheet,Text,View}from"react-native";
import{useNavigation}from"@react-navigation/native";
import{useTheme}from"../theme/ThemeProvider";
import{useAuthContext}from"../auth/context";
import{ordersPaymentsService}from"../services/ordersPaymentsService";
import type{SavedPaymentMethod,StarCountry,StarPackage}from"../services/ordersPaymentsService";
import{useStripeCompat}from"../services/stripeNative";
import Constants from"expo-constants";
import BackIcon from"../assets/navigation/back.svg";
import ReDomLogo from"../assets/brand/redom-logo.svg";
import AddPaymentIcon from"../assets/home-feed/add-payment-method.svg";
import VisaIcon from"../assets/payment/card-brands/visa.svg";
import MastercardIcon from"../assets/payment/card-brands/mastercard.svg";
import AmexIcon from"../assets/payment/card-brands/american-express.svg";
import DiscoverIcon from"../assets/payment/card-brands/discover.svg";
import JcbIcon from"../assets/payment/card-brands/jcb.svg";
import UnionPayIcon from"../assets/payment/card-brands/unionpay.svg";
import VerveIcon from"../assets/payment/card-brands/verve.svg";

type Step="catalog"|"payment"|"savedVerification";
type PaymentResult="success"|"failed"|null;
const blue="#1877F2";

function BrandLogo({brand}:{brand?:string|null}){
 const b=String(brand||"").toLowerCase();
 const Icon=b==="visa"?VisaIcon:b==="mastercard"?MastercardIcon:b==="american express"||b==="amex"?AmexIcon:b==="discover"?DiscoverIcon:b==="jcb"?JcbIcon:b==="unionpay"||b==="union pay"?UnionPayIcon:b==="verve"?VerveIcon:null;
 return Icon?<Icon width={42} height={28}/>:<View style={styles.brandFallback}><Text style={styles.brandFallbackText}>{String(brand||"Card").slice(0,1).toUpperCase()}</Text></View>;
}

export function BuyStarsScreen(){
 const n=useNavigation<any>();const{colors}=useTheme();const{user}=useAuthContext();const{handleNextAction}=useStripeCompat();
 const[countries,setCountries]=useState<StarCountry[]>([]),[packages,setPackages]=useState<StarPackage[]>([]);
 const[country,setCountry]=useState<StarCountry|null>(null),[selected,setSelected]=useState<StarPackage|null>(null);
 const[loading,setLoading]=useState(true),[countryOpen,setCountryOpen]=useState(false),[step,setStep]=useState<Step>("catalog");
 const[agreed,setAgreed]=useState(false),[processing,setProcessing]=useState(false),[result,setResult]=useState<PaymentResult>(null);
 const[reference,setReference]=useState<string|null>(null),[retryReference,setRetryReference]=useState<string|null>(null);
 const[paymentMethodTypes,setPaymentMethodTypes]=useState<string[]>([]),[trialEligible,setTrialEligible]=useState(false),[trialMode,setTrialMode]=useState(false);
 const[savedMethods,setSavedMethods]=useState<SavedPaymentMethod[]>([]),[savedSelected,setSavedSelected]=useState<SavedPaymentMethod|null>(null),[savedPopup,setSavedPopup]=useState(false);
 const[savedFailure,setSavedFailure]=useState(""),[fallbackCount,setFallbackCount]=useState<number|null>(null);
 const firstName=String((user as any)?.firstName||(user as any)?.first_name||(user as any)?.displayName||"").trim().split(/\s+/)[0]||"there";
 const expoGo=Constants.appOwnership==="expo";

 useEffect(()=>{let active=true;
   void ordersPaymentsService.starsTrialEligibility().then(r=>{if(active)setTrialEligible(Boolean(r.eligible))}).catch(()=>undefined);
   void ordersPaymentsService.starsCatalog().then(r=>{if(!active)return;setCountries(r.countries);setPackages(r.packages);if(r.selectedCountry)setCountry(r.selectedCountry)}).finally(()=>{if(active)setLoading(false)});
   return()=>{active=false};
 },[]);

 const chooseCountry=useCallback((c:StarCountry)=>{setCountry(c);setCountryOpen(false);setSelected(null);setRetryReference(null);void ordersPaymentsService.starsCatalog(c.isoCode).then(r=>setPackages(r.packages))},[]);
 const payableText=useCallback((pkg:StarPackage)=>pkg.currency==="USD"?"$"+pkg.usdPrice.toFixed(2):pkg.localAmountFormatted,[]);
 const priceLine=useCallback((pkg:StarPackage)=>"$"+pkg.usdPrice.toFixed(2)+" USD",[]);
 const trialChargeDate=useMemo(()=>{const d=new Date();d.setDate(d.getDate()+7);return d.toLocaleString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"})},[]);

 const openPackage=useCallback(async(pkg:StarPackage)=>{
   if(pkg.payable===false)return;
   setSelected(pkg);setAgreed(false);setResult(null);setRetryReference(null);setSavedFailure("");
   try{
     const r=await ordersPaymentsService.paymentMethods();
     const eligible=(r.methods||[]).filter(m=>String(m.status||"active")==="active"&&m.reusable&&m.stripePaymentMethodId);
     if(eligible.length){setSavedMethods(eligible);setSavedSelected(eligible[0]);setSavedPopup(true);return;}
   }catch{}
   setStep("payment");
 },[]);

 const startNormalCheckout=useCallback(async()=>{
   if(!country||!selected||!agreed)return;
   setProcessing(true);setResult(null);
   try{
     const r=await ordersPaymentsService.initializeStars({packageKey:selected.key,countryCode:country.isoCode,email:String(user?.email||""),preferredChannel:"card",retryReference});
     setReference(r.reference);setPaymentMethodTypes(r.paymentMethodTypes??[]);
     if(!r.checkoutUrl)throw new Error("ReDom Pay did not receive a secure checkout URL.");
     await Linking.openURL(r.checkoutUrl);
   }catch{setProcessing(false);}
 },[country,selected,agreed,user?.email,retryReference]);

 const pollSavedResult=useCallback(async(ref:string)=>{
   for(let i=0;i<12;i+=1){
     try{
       const r=await ordersPaymentsService.verifyPayment(ref);
       if(String(r.payment.status)==="paid"){setResult("success");setProcessing(false);return true;}
       if(["failed","abandoned"].includes(String(r.payment.status))){setSavedFailure(String(r.payment.failureReason||"The saved payment method was declined or could not complete the payment."));setProcessing(false);return false;}
     }catch{}
     await new Promise(resolve=>setTimeout(resolve,2000));
   }
   setSavedFailure("The payment provider did not confirm the saved-card payment.");setProcessing(false);return false;
 },[]);

 const fallbackToCheckout=useCallback(()=>{setSavedPopup(false);setFallbackCount(5)},[]);
 useEffect(()=>{if(fallbackCount==null)return;if(fallbackCount<=0){setFallbackCount(null);setStep("payment");setAgreed(false);return;}const t=setTimeout(()=>setFallbackCount(v=>v==null?null:v-1),1000);return()=>clearTimeout(t)},[fallbackCount]);

 const continueSavedPayment=useCallback(async()=>{
   if(!country||!selected||!savedSelected)return;
   setSavedPopup(false);setSavedFailure("");setProcessing(true);
   try{
     const r=await ordersPaymentsService.initializeSavedStarsPayment({packageKey:selected.key,countryCode:country.isoCode,email:String(user?.email||""),paymentMethodId:savedSelected.id});
     setReference(r.reference);
     if(r.status==="succeeded"){await pollSavedResult(r.reference);return;}
     if(r.status==="requires_action"&&r.clientSecret&&!expoGo){
       const next=await handleNextAction({clientSecret:r.clientSecret});
       if(next?.error){setSavedFailure(next.error.localizedMessage||next.error.message||"Stripe could not complete the required authentication.");setProcessing(false);fallbackToCheckout();return;}
       await pollSavedResult(r.reference);return;
     }
     if(r.status==="requires_action"&&expoGo){setSavedFailure("Stripe requires additional authentication for this saved card.");setProcessing(false);fallbackToCheckout();return;}
     if(r.status==="processing"){await pollSavedResult(r.reference);return;}
     setSavedFailure("The saved payment method was declined by the payment provider.");setProcessing(false);fallbackToCheckout();
   }catch(e){setSavedFailure(e instanceof Error?e.message:"The saved payment method could not be used.");setProcessing(false);fallbackToCheckout();}
 },[country,selected,savedSelected,user?.email,expoGo,handleNextAction,pollSavedResult,fallbackToCheckout]);

 const verifyAndResolve=useCallback(async(ref:string)=>{
   setReference(ref);setProcessing(true);
   for(let i=0;i<24;i+=1){try{const r=await ordersPaymentsService.verifyPayment(ref);const p=r.payment;
     if(String(p.status)==="paid"){setResult("success");setProcessing(false);return;}
     if(String(p.status)==="failed"){setProcessing(false);if(p.finalFailure)setResult("failed");else{setRetryReference(ref);setAgreed(false);setStep("payment");}return;}
     if(String(p.status)==="abandoned"){setProcessing(false);setAgreed(false);setStep("payment");return;}
   }catch{}await new Promise(resolve=>setTimeout(resolve,5000))}
   setProcessing(false);setResult("failed");
 },[]);

 useEffect(()=>{const handle=({url}:{url:string})=>{if(!url.startsWith("redom://payment/callback"))return;const m=url.match(/[?&]reference=([^&]+)/);const ref=m?decodeURIComponent(m[1]):reference;if(ref)void verifyAndResolve(ref)};const sub=Linking.addEventListener("url",handle);void Linking.getInitialURL().then(url=>{if(url?.startsWith("redom://payment/callback")){const m=url.match(/[?&]reference=([^&]+)/);const ref=m?decodeURIComponent(m[1]):reference;if(ref)void verifyAndResolve(ref)}}).catch(()=>undefined);return()=>sub.remove()},[reference,verifyAndResolve]);

 if(loading)return <View style={styles.overlay}><View style={[styles.sheet,{backgroundColor:colors.surface}]}><ActivityIndicator style={{marginTop:50}} color={colors.primary}/></View></View>;
 if(processing)return <View style={styles.overlay}><View style={[styles.sheet,{backgroundColor:colors.surface}]}><View style={styles.sheetHandle}/><View style={styles.header}><View style={{width:25}}/><Text style={[styles.headerTitle,{color:colors.text}]}>ReDom Pay</Text><View style={{width:25}}/></View><View style={styles.resultWrap}><ActivityIndicator size="large" color={colors.primary}/><Text style={[styles.resultTitle,{color:colors.text}]}>{savedSelected?"Charging "+String(savedSelected.brand||"Card")+" - "+String(savedSelected.last4||"")+" .....":"Processing payment"}</Text><Text style={[styles.resultText,{color:colors.textSecondary}]}>Connecting to payment Provider.....</Text><Text style={[styles.smallText,{color:colors.textSecondary}]}>ReDom Platforms, Inc.</Text></View></View></View>;
 if(result==="success")return <View style={styles.overlay}><View style={[styles.sheet,{backgroundColor:colors.surface}]}><View style={styles.sheetHandle}/><View style={styles.header}><Pressable onPress={()=>n.navigate("StarsActivity",{refresh:Date.now()})}><BackIcon width={25} height={25}/></Pressable><Text style={[styles.headerTitle,{color:colors.text}]}>ReDom Stars Activity</Text><View style={{width:25}}/></View><View style={styles.resultWrap}><Text style={styles.successMark}>✓</Text><Text style={[styles.resultTitle,{color:colors.text}]}>Payment successful</Text><Text style={[styles.resultText,{color:colors.textSecondary}]}>{selected?.stars.toLocaleString()} ReDom Stars were credited after backend verification.</Text></View></View></View>;
 if(result==="failed")return <View style={styles.overlay}><View style={[styles.sheet,{backgroundColor:colors.surface}]}><View style={styles.sheetHandle}/><View style={styles.header}><Pressable onPress={()=>{setResult(null);setProcessing(false)}}><BackIcon width={25} height={25}/></Pressable><Text style={[styles.headerTitle,{color:colors.text}]}>Payment</Text><View style={{width:25}}/></View><View style={styles.resultWrap}><Text style={styles.failMark}>!</Text><Text style={[styles.resultTitle,{color:colors.text}]}>Payment Failed!</Text><Text style={[styles.resultText,{color:colors.textSecondary}]}>The payment could not be completed after the provider's available attempts.</Text><Pressable onPress={()=>n.navigate("StarsActivity",{refresh:Date.now()})} style={[styles.primaryButton,{backgroundColor:colors.primary}]}><Text style={styles.primaryText}>Return to Stars Activity</Text></Pressable></View></View></View>;

 return <View style={styles.overlay}><View style={[styles.sheet,{backgroundColor:colors.surface}]}>
  <View style={styles.sheetHandle}/><View style={[styles.header,{borderBottomColor:colors.border}]}>
   <Pressable onPress={()=>step==="catalog"?n.goBack():setStep("catalog")} hitSlop={10}><BackIcon width={25} height={25}/></Pressable>
   <View style={styles.headerBrand}><ReDomLogo width={30} height={24}/><Text style={[styles.headerTitle,{color:colors.text}]}>{step==="catalog"?"Buy Stars":step==="savedVerification"?"ReDom Pay!":"Payment"}</Text></View><View style={{width:25}}/>
  </View>
  {step==="catalog"?<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
   <Text style={[styles.heading,{color:colors.text}]}>Choose your country</Text>
   <Pressable onPress={()=>setCountryOpen(v=>!v)} style={[styles.countryField,{backgroundColor:colors.surface,borderColor:colors.border}]}>
    <View><Text style={[styles.fieldLabel,{color:colors.textSecondary}]}>Choose country</Text><Text style={[styles.fieldValue,{color:colors.text}]}>{country?.name||"Choose country"}{country?"  •  "+country.currency:""}</Text></View><Text style={[styles.chevron,{color:colors.textSecondary}]}>{countryOpen?"⌃":"⌄"}</Text>
   </Pressable>
   {countryOpen?<View style={[styles.countryList,{borderColor:colors.border,backgroundColor:colors.surface}]}>{countries.map(c=><Pressable key={c.isoCode} onPress={()=>chooseCountry(c)} style={styles.countryOption}><Text style={[styles.countryName,{color:colors.text}]}>{c.name}</Text><Text style={[styles.countryCurrency,{color:colors.textSecondary}]}>{c.currency}</Text></Pressable>)}</View>:null}
   {country?<><Text style={[styles.sectionTitle,{color:colors.text}]}>ReDom Stars</Text>
    <View style={styles.grid}>{packages.map(pkg=><View key={pkg.key} style={[styles.packageCard,{backgroundColor:colors.surface,borderColor:pkg.popular?colors.primary:colors.border}]}>
      {pkg.popular?<View style={[styles.badge,{backgroundColor:colors.primary}]}><Text style={styles.badgeText}>MOST POPULAR</Text></View>:null}
      {pkg.firstPurchaseUsdPrice!=null&&pkg.usdPrice<pkg.regularUsdPrice?<Text style={[styles.discount,{color:colors.primary}]}>{pkg.firstPurchaseDiscountPercent}% OFF</Text>:null}
      <Text style={[styles.packageStars,{color:colors.text}]}>{pkg.stars.toLocaleString()} Stars</Text>
      <Text style={[styles.packagePrice,{color:colors.text}]}>{priceLine(pkg)}</Text>
      {pkg.currency!=="USD"?<Text style={[styles.localPrice,{color:colors.textSecondary}]}>{pkg.localAmountFormatted}</Text>:null}
      {pkg.firstPurchaseUsdPrice!=null&&pkg.usdPrice<pkg.regularUsdPrice?<Text style={[styles.oldPrice,{color:colors.textSecondary}]}>{"$"+pkg.regularUsdPrice.toFixed(2)+" USD"}</Text>:null}
      <Pressable disabled={pkg.payable===false} onPress={()=>void openPackage(pkg)} style={[styles.buyButton,{backgroundColor:pkg.payable===false?colors.border:colors.primary}]}><Text style={styles.buyButtonText}>{pkg.payable===false?"Unavailable":"Buy • "+payableText(pkg)}</Text></Pressable>
    </View>)}</View>
    <View style={styles.grid}><View style={[styles.trialCard,{backgroundColor:colors.surface,borderColor:colors.primary}]}>
      <Text style={[styles.trialBadge,{color:colors.primary}]}>7-DAY TRIAL</Text><Text style={[styles.trialTitle,{color:colors.text}]}>20 ReDom Stars</Text><Text style={[styles.trialText,{color:colors.textSecondary}]}>No charge today</Text>
      {trialEligible?<Pressable onPress={()=>{setTrialMode(true);setSelected(null);setAgreed(false);setResult(null);setStep("payment")}} style={[styles.buyButton,{backgroundColor:colors.primary}]}><Text style={styles.buyButtonText}>Buy • Free</Text></Pressable>:<Text style={[styles.trialUnavailable,{color:colors.textSecondary}]}>Trial unavailable</Text>}
    </View></View>
   </>:null}
  </ScrollView>:step==="savedVerification"?<ScrollView contentContainerStyle={styles.content}>
    <View style={[styles.savedCardLarge,{borderColor:colors.border,backgroundColor:colors.surface}]}><BrandLogo brand={savedSelected?.brand}/><Text style={[styles.savedTitle,{color:colors.text}]}>Enter CVV</Text><Text style={[styles.detail,{color:colors.textSecondary}]}>Enter CVV of your {savedSelected?.brand||"card"} ending in {savedSelected?.last4||"••••"}.</Text><Text style={[styles.providerNote,{color:colors.textSecondary}]}>Stripe securely validates the saved payment method during the payment attempt. ReDom never stores or compares the original CVV.</Text><Text style={[styles.security,{color:colors.textSecondary}]}>Security warning: never enter your ReDom password, payment PIN, full card number, or one-time security code into ReDom.</Text><Pressable onPress={()=>void continueSavedPayment()} style={[styles.primaryButton,{backgroundColor:colors.primary}]}><Text style={styles.primaryText}>Continue To Payment</Text></Pressable>{savedFailure?<Text style={styles.failureText}>{savedFailure}</Text>:null}</View>
  </ScrollView>:<ScrollView contentContainerStyle={styles.content}>
    {fallbackCount!=null?<View style={[styles.summaryCard,{borderColor:colors.border,backgroundColor:colors.surface}]}><Text style={[styles.sectionTitleSmall,{color:colors.text}]}>Continuing To Checkout......</Text><Text style={[styles.countdown,{color:colors.primary}]}>{fallbackCount}</Text><Text style={[styles.detail,{color:colors.textSecondary}]}>The saved ReDom Pay attempt failed. The existing normal checkout will open automatically.</Text></View>:trialMode?<><View style={[styles.summaryCard,{borderColor:colors.border,backgroundColor:colors.surface}]}><Text style={[styles.sectionTitleSmall,{color:colors.text}]}>7-Day Trial</Text><Text style={[styles.selectedStars,{color:colors.text}]}>20 ReDom Stars</Text><Text style={[styles.detail,{color:colors.textSecondary}]}>No charge today.</Text><Text style={[styles.detail,{color:colors.textSecondary}]}>After 7 days, ReDom will attempt the authorized one-time conversion payment for 10 Stars.</Text><Text style={[styles.detail,{color:colors.textSecondary}]}>Charge timing: {trialChargeDate}.</Text><Text style={[styles.detail,{color:colors.textSecondary}]}>If the first attempt fails, ReDom will retry once approximately 24 hours later.</Text></View><Text style={[styles.sectionTitleSmall,{color:colors.text}]}>Trial authorization</Text><View style={[styles.termsCard,{borderColor:colors.border,backgroundColor:colors.surface}]}><Text style={[styles.termsText,{color:colors.textSecondary}]}>By continuing, you authorize ReDom to save the Stripe payment method and make the future payment described above. No payment is taken when the trial starts.</Text><Text style={[styles.termsText,{color:colors.textSecondary}]}>Terms version: stars-trial-v1</Text></View><Pressable onPress={()=>setAgreed(v=>!v)} style={styles.checkboxRow}><View style={[styles.checkbox,{borderColor:agreed?colors.primary:colors.border,backgroundColor:agreed?colors.primary:"transparent"}]}>{agreed?<Text style={styles.check}>✓</Text>:null}</View><Text style={[styles.agreement,{color:colors.text}]}>I agree to the ReDom Terms and authorize the future payment.</Text></Pressable><Pressable disabled={!agreed} onPress={()=>void(async()=>{if(!country||!agreed)return;setProcessing(true);try{const r=await ordersPaymentsService.initializeStarsTrial({countryCode:country.isoCode,email:String(user?.email||""),termsVersion:"stars-trial-v1",consentTimestamp:new Date().toISOString(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC"});setReference(r.reference);if(r.checkoutUrl)await Linking.openURL(r.checkoutUrl)}catch{setProcessing(false)}})()} style={[styles.primaryButton,{backgroundColor:agreed?colors.primary:colors.border}]}><Text style={styles.primaryText}>Authorize 7-day trial</Text></Pressable></>:selected?<><View style={[styles.summaryCard,{borderColor:colors.border,backgroundColor:colors.surface}]}><Text style={[styles.sectionTitleSmall,{color:colors.text}]}>ReDom Stars</Text><Text style={[styles.selectedStars,{color:colors.text}]}>{selected.stars.toLocaleString()} Stars</Text><Text style={[styles.detail,{color:colors.textSecondary}]}>Selected country: {country?.name}</Text><Text style={[styles.detail,{color:colors.textSecondary}]}>Currency: {country?.currency}</Text><Text style={[styles.detail,{color:colors.textSecondary}]}>Amount: {payableText(selected)}</Text><Text style={[styles.detail,{color:colors.textSecondary}]}>Payment methods: {paymentMethodTypes.length?paymentMethodTypes.join(" • "):"Provider-selected"}</Text></View><Text style={[styles.sectionTitleSmall,{color:colors.text}]}>ReDom Payment Terms</Text><View style={[styles.termsCard,{borderColor:colors.border,backgroundColor:colors.surface}]}><Text style={[styles.termsText,{color:colors.textSecondary}]}>By continuing, you agree to the applicable ReDom Payment Terms. The backend remains authoritative for the selected package, amount, currency and payment result.</Text></View><Pressable onPress={()=>setAgreed(v=>!v)} style={styles.checkboxRow}><View style={[styles.checkbox,{borderColor:agreed?colors.primary:colors.border,backgroundColor:agreed?colors.primary:"transparent"}]}>{agreed?<Text style={styles.check}>✓</Text>:null}</View><Text style={[styles.agreement,{color:colors.text}]}>I agree to the applicable ReDom Payment Terms.</Text></Pressable><Pressable disabled={!agreed} onPress={()=>void startNormalCheckout()} style={[styles.primaryButton,{backgroundColor:agreed?colors.primary:colors.border}]}><Text style={styles.primaryText}>Continue To Checkout</Text></Pressable></>:<Text style={[styles.smallText,{color:colors.textSecondary}]}>Select a Stars package to continue.</Text>}
  </ScrollView>}

  <Modal transparent visible={savedPopup} animationType="slide" onRequestClose={()=>setSavedPopup(false)}><View style={styles.modalBackdrop}><View style={[styles.savedSheet,{backgroundColor:colors.surface}]}><View style={styles.sheetHandle}/><View style={styles.modalHeader}><View style={styles.addIconCircle}><AddPaymentIcon width={34} height={34}/></View><Text style={[styles.modalTitle,{color:colors.text}]}>ReDom Pay!</Text></View><Text style={[styles.modalMessage,{color:colors.text}]}>{firstName+", You Have An Active Payment Method Saved With ReDom Pay!"}</Text><ScrollView style={{maxHeight:190}}>{savedMethods.map(m=><Pressable key={m.id} onPress={()=>setSavedSelected(m)} style={[styles.savedOption,{borderColor:savedSelected?.id===m.id?colors.primary:colors.border,backgroundColor:colors.surface}]}><BrandLogo brand={m.brand}/><View style={{flex:1,marginLeft:12}}><Text style={[styles.savedName,{color:colors.text}]}>{String(m.brand||"Card")+" - "+String(m.last4||"••••")+" • "+String(m.countryCode||"—")}</Text>{m.id===savedMethods[0]?.id?<Text style={[styles.defaultText,{color:colors.primary}]}>Default</Text>:null}</View><View style={[styles.radio,{borderColor:savedSelected?.id===m.id?colors.primary:colors.border}]}>{savedSelected?.id===m.id?<View style={styles.radioDot}/>:null}</View></Pressable>)}</ScrollView><View style={styles.modalActions}><Pressable onPress={()=>setSavedPopup(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable onPress={()=>{setSavedPopup(false);setStep("payment");setAgreed(false)}} style={styles.noUseButton}><Text style={styles.noUseText}>No, Don't Use ReDom Pay!</Text></Pressable><Pressable onPress={()=>{setSavedPopup(false);setStep("savedVerification")}} style={styles.continueButton}><Text style={styles.primaryText}>Continue</Text></Pressable></View></View></View></Modal>
 </View></View>;
}

const styles=StyleSheet.create({
 overlay:{flex:1,backgroundColor:"rgba(0,0,0,.28)",justifyContent:"flex-end"},sheet:{height:"92%",borderTopLeftRadius:28,borderTopRightRadius:28,overflow:"hidden"},sheetHandle:{width:42,height:4,borderRadius:2,backgroundColor:"#BCC0C4",alignSelf:"center",marginTop:8,marginBottom:4},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:18},headerBrand:{flex:1,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:6},headerTitle:{fontSize:21,fontWeight:"800"},content:{padding:20,paddingBottom:70},heading:{fontSize:25,fontWeight:"900",marginBottom:12},countryField:{minHeight:64,borderWidth:1,borderRadius:16,paddingHorizontal:16,paddingVertical:10,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},fieldLabel:{fontSize:12,fontWeight:"700"},fieldValue:{fontSize:17,fontWeight:"700",marginTop:2},chevron:{fontSize:24},countryList:{borderWidth:1,borderRadius:16,marginTop:8,overflow:"hidden"},countryOption:{padding:14,borderBottomWidth:1,borderBottomColor:"#DADDE1",flexDirection:"row",justifyContent:"space-between"},countryName:{fontSize:16,fontWeight:"700"},countryCurrency:{fontSize:15},sectionTitle:{fontSize:22,fontWeight:"900",marginTop:25,marginBottom:11},grid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",rowGap:12},packageCard:{width:"47%",minHeight:185,borderWidth:1,borderRadius:18,padding:13},badge:{alignSelf:"flex-start",paddingHorizontal:7,paddingVertical:4,borderRadius:999,marginBottom:7},badgeText:{color:"#fff",fontSize:8,fontWeight:"900"},discount:{fontSize:12,fontWeight:"900",marginBottom:4},packageStars:{fontSize:18,fontWeight:"900"},packagePrice:{fontSize:14,fontWeight:"800",marginTop:5},localPrice:{fontSize:13,marginTop:2},oldPrice:{fontSize:12,textDecorationLine:"line-through",marginTop:3},buyButton:{minHeight:43,borderRadius:22,alignItems:"center",justifyContent:"center",marginTop:12,paddingHorizontal:8},buyButtonText:{color:"#fff",fontSize:14,fontWeight:"900"},trialCard:{width:"47%",minHeight:185,borderWidth:2,borderRadius:18,padding:13},trialBadge:{fontSize:11,fontWeight:"900",marginBottom:8},trialTitle:{fontSize:18,fontWeight:"900"},trialText:{fontSize:13,lineHeight:18,marginTop:8},trialUnavailable:{fontSize:13,lineHeight:18,marginTop:13},summaryCard:{borderWidth:1,borderRadius:18,padding:17},sectionTitleSmall:{fontSize:20,fontWeight:"900",marginTop:20,marginBottom:9},selectedStars:{fontSize:25,fontWeight:"900",marginBottom:8},detail:{fontSize:14,lineHeight:21,marginTop:4},termsCard:{borderWidth:1,borderRadius:15,padding:15},termsText:{fontSize:14,lineHeight:21,marginBottom:7},checkboxRow:{flexDirection:"row",alignItems:"flex-start",marginTop:17},checkbox:{width:24,height:24,borderWidth:2,borderRadius:6,alignItems:"center",justifyContent:"center",marginRight:10},check:{color:"#fff",fontSize:16,fontWeight:"900"},agreement:{flex:1,fontSize:15,lineHeight:21},primaryButton:{minHeight:54,borderRadius:27,alignItems:"center",justifyContent:"center",marginTop:20,paddingHorizontal:20},primaryText:{color:"#fff",fontSize:16,fontWeight:"900"},security:{fontSize:12,lineHeight:18,textAlign:"center",marginTop:16},smallText:{fontSize:14,lineHeight:21,marginTop:10},resultWrap:{flex:1,alignItems:"center",justifyContent:"center",padding:24},resultTitle:{fontSize:25,fontWeight:"900",marginTop:12,textAlign:"center"},resultText:{fontSize:16,lineHeight:24,textAlign:"center",marginTop:9},successMark:{fontSize:50,fontWeight:"900",color:"#16a34a"},failMark:{fontSize:50,fontWeight:"900",color:"#dc2626"},countdown:{fontSize:52,fontWeight:"900",textAlign:"center",marginTop:10},failureText:{fontSize:14,lineHeight:21,marginTop:12,textAlign:"center",color:"#B42318"},savedCardLarge:{borderWidth:1,borderRadius:20,padding:20},savedTitle:{fontSize:25,fontWeight:"900",marginTop:14},providerNote:{fontSize:14,lineHeight:21,marginTop:12},savedSheet:{borderTopLeftRadius:28,borderTopRightRadius:28,padding:20,paddingBottom:28},modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,.52)",justifyContent:"flex-end"},modalHeader:{flexDirection:"row",alignItems:"center",marginBottom:12},addIconCircle:{width:48,height:48,borderRadius:24,alignItems:"center",justifyContent:"center",backgroundColor:"#EEF4FF"},modalTitle:{fontSize:25,fontWeight:"900",marginLeft:10},modalMessage:{fontSize:17,fontWeight:"800",lineHeight:24,marginBottom:15},savedOption:{minHeight:68,borderWidth:1,borderRadius:15,padding:12,flexDirection:"row",alignItems:"center",marginBottom:8},savedName:{fontSize:15,fontWeight:"800"},defaultText:{fontSize:12,fontWeight:"900",marginTop:2},radio:{width:24,height:24,borderWidth:2,borderRadius:12,alignItems:"center",justifyContent:"center"},radioDot:{width:12,height:12,borderRadius:6,backgroundColor:blue},brandFallback:{width:42,height:28,borderRadius:6,backgroundColor:"#E4E6EB",alignItems:"center",justifyContent:"center"},brandFallbackText:{fontWeight:"900",fontSize:15},modalActions:{gap:8,marginTop:10},cancelButton:{minHeight:46,borderRadius:23,backgroundColor:"#E4E6EB",alignItems:"center",justifyContent:"center"},cancelText:{fontSize:15,fontWeight:"800",color:"#1C1E21"},noUseButton:{minHeight:46,borderRadius:23,borderWidth:1,borderColor:"#DADDE1",alignItems:"center",justifyContent:"center"},noUseText:{fontSize:14,fontWeight:"800",color:"#1C1E21"},continueButton:{minHeight:50,borderRadius:25,backgroundColor:blue,alignItems:"center",justifyContent:"center"}
});