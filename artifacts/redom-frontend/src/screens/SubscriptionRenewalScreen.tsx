import React,{useEffect,useState}from"react";
import{SafeAreaView,View,Text,Pressable,StyleSheet,Alert,ActivityIndicator,Linking}from"react-native";
import{useNavigation,useRoute}from"@react-navigation/native";
import{useTheme}from"../theme/ThemeProvider";
import{api}from"../api/client";
import BackIcon from"../assets/navigation/back.svg";
import ReDomMark from"../assets/brand/redom-mark.svg";

export function SubscriptionRenewalScreen(){
 const n=useNavigation<any>(); const r=useRoute<any>(); const{colors}=useTheme();
 const name=r.params?.subscriptionName||"ReDom Verified Standard"; const subscriptionId=r.params?.subscriptionId; const[loading,setLoading]=useState(false); const[reference,setReference]=useState<string|null>(null);
 const verify=async(ref:string)=>{try{const result=await api.get<{success:boolean;payment:{status:string}}>("/payments/verify/"+encodeURIComponent(ref));if(result.payment.status==="paid"){Alert.alert("Payment complete","Your subscription has been renewed.",[{text:"OK",onPress:()=>n.navigate("SubscriptionDetails",{subscriptionId})}]);}else if(result.payment.status){Alert.alert("Payment status",result.payment.status);}}catch{}};
 useEffect(()=>{const listener=Linking.addEventListener("url",event=>{try{const url=new URL(event.url);if(url.hostname==="payment"||url.pathname==="/callback"){const ref=url.searchParams.get("reference");if(ref){setReference(ref);void verify(ref);}}}catch{}});void Linking.getInitialURL().then(url=>{if(url){try{const parsed=new URL(url);const ref=parsed.searchParams.get("reference");if(ref){setReference(ref);void verify(ref);}}catch{}}});return()=>listener.remove();},[]);
 const start=async()=>{if(!subscriptionId)return;setLoading(true);try{const result=await api.post<{success:boolean;checkoutUrl:string;reference:string}>("/payments/subscription/renew",{subscriptionId});setReference(result.reference);await Linking.openURL(result.checkoutUrl);}catch(e){Alert.alert("Unable to start payment",e instanceof Error?e.message:"Please try again.");}finally{setLoading(false);}};
 return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
  <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>n.goBack()} style={s.back}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>Renew subscription</Text><View style={{width:34}}/></View>
  <View style={s.content}><View style={[s.logo,{borderColor:colors.border}]}><ReDomMark width={54} height={54}/></View><Text style={[s.plan,{color:colors.text}]}>{name}</Text><Text style={[s.muted,{color:colors.textSecondary}]}>Recurring monthly payment</Text><Text style={[s.notice,{color:colors.textSecondary}]}>Your payment will be securely processed and your subscription will be updated only after the payment is confirmed.</Text><Pressable disabled={loading} onPress={()=>void start()} style={[s.button,{backgroundColor:colors.primary,opacity:loading?.55:1}]}>{loading?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>Continue to payment</Text>}</Pressable>{reference?<Text style={[s.reference,{color:colors.textSecondary}]}>Payment reference: {reference}</Text>:null}</View>
 </SafeAreaView>;
}
const s=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14},back:{width:34,height:34,alignItems:"center",justifyContent:"center"},title:{fontSize:20,fontWeight:"800",flex:1},content:{padding:30},logo:{width:84,height:84,borderRadius:42,borderWidth:1,alignItems:"center",justifyContent:"center",alignSelf:"center",marginBottom:22},plan:{fontSize:27,fontWeight:"900"},muted:{fontSize:17,marginTop:5},notice:{fontSize:16,lineHeight:24,marginTop:30},button:{marginTop:35,padding:17,borderRadius:8,alignItems:"center"},buttonText:{color:"#fff",fontSize:17,fontWeight:"800"},reference:{fontSize:13,textAlign:"center",marginTop:18}});
