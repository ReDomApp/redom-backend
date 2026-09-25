import React,{useCallback,useEffect,useState}from"react";
import{SafeAreaView,View,Text,Pressable,StyleSheet,ScrollView,ActivityIndicator,Alert}from"react-native";
import{useNavigation,useRoute,useFocusEffect}from"@react-navigation/native";
import{useTheme}from"../theme/ThemeProvider";
import BackIcon from"../assets/navigation/back.svg";
import{ordersPaymentsService}from"../services/ordersPaymentsService";import type{SavedPaymentMethod}from"../services/ordersPaymentsService";

export function PaymentMethodsScreen(){
 const n=useNavigation<any>();const route=useRoute<any>();const{colors}=useTheme();const[methods,setMethods]=useState<SavedPaymentMethod[]>([]);const[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{setLoading(true);try{const r=await ordersPaymentsService.paymentMethods();setMethods(r.methods)}catch(e){Alert.alert("Payment methods",e instanceof Error?e.message:"Unable to load payment methods.")}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);useFocusEffect(useCallback(()=>{void load()},[load]));
 useEffect(()=>{if(route.params?.autoAdd){Alert.alert("Add payment method","For security, ReDom adds a reusable Paystack card after an eligible card checkout. No raw card details are stored by ReDom.",[{text:"CANCEL",style:"cancel"},{text:"Continue to checkout",onPress:()=>n.navigate("BuyStars")}]);n.setParams?.({autoAdd:false})}},[route.params?.autoAdd]);
 const remove=async(m:SavedPaymentMethod)=>{Alert.prompt?.("Remove payment method","Enter your ReDom account password to remove this saved card.",[{text:"Cancel",style:"cancel"},{text:"Remove",style:"destructive",onPress:async(password)=>{if(!password)return;try{await ordersPaymentsService.removePaymentMethod(m.id,password);await load()}catch(e){Alert.alert("Unable to remove",e instanceof Error?e.message:"Password verification failed.")}}}], "secure-text");};
 return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
  <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>n.goBack()}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>Payment methods</Text><View style={{width:24}}/></View>
  <ScrollView contentContainerStyle={s.content}>
   <Text style={[s.heading,{color:colors.text}]}>Payment methods</Text>
   <Text style={[s.muted,{color:colors.textSecondary}]}>ReDom never stores raw card numbers or CVV. Eligible Paystack card authorizations are stored as encrypted provider tokens.</Text>
   <Pressable onPress={()=>n.navigate("BuyStars")} style={[s.add,{backgroundColor:colors.primary}]}><Text style={s.addText}>Add payment method</Text></Pressable>
   {loading?<ActivityIndicator style={{marginTop:30}} color={colors.primary}/>:methods.length===0?<View style={[s.empty,{borderColor:colors.border,backgroundColor:colors.surface}]}><Text style={[s.emptyTitle,{color:colors.text}]}>No saved payment methods</Text><Text style={[s.muted,{color:colors.textSecondary}]}>Complete an eligible Paystack card checkout and choose the provider's save-card option when available.</Text></View>:methods.map(m=><View key={m.id} style={[s.card,{borderColor:colors.border,backgroundColor:colors.surface}]}><View style={s.row}><View style={{flex:1}}><Text style={[s.brand,{color:colors.text}]}>{m.brand||"Card"} {m.last4?"•••• "+m.last4:""}</Text><Text style={[s.muted,{color:colors.textSecondary}]}>{m.bank||"Paystack"} · {m.currency||"—"}</Text></View><Pressable onPress={()=>remove(m)}><Text style={[s.remove,{color:"#D32F2F"}]}>Remove</Text></Pressable></View></View>)}
  </ScrollView>
 </SafeAreaView>
}
const s=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14},title:{fontSize:19,fontWeight:"800"},content:{padding:18,paddingBottom:40},heading:{fontSize:25,fontWeight:"900"},muted:{fontSize:14,lineHeight:21,marginTop:7},add:{height:52,borderRadius:26,alignItems:"center",justifyContent:"center",marginTop:18},addText:{color:"#fff",fontSize:17,fontWeight:"800"},empty:{borderWidth:1,borderRadius:15,padding:18,marginTop:20},emptyTitle:{fontSize:18,fontWeight:"800"},card:{borderWidth:1,borderRadius:15,padding:16,marginTop:12},row:{flexDirection:"row",alignItems:"center"},brand:{fontSize:18,fontWeight:"800"},remove:{fontSize:14,fontWeight:"800"}});
