import React,{useEffect,useState}from"react";
import{SafeAreaView,View,Text,Pressable,StyleSheet,ScrollView,ActivityIndicator}from"react-native";
import{useNavigation}from"@react-navigation/native";
import{useTheme}from"../theme/ThemeProvider";
import BackIcon from"../assets/navigation/back.svg";
import{ordersPaymentsService,SavedPaymentMethod}from"../services/ordersPaymentsService";

export function PaymentMethodsScreen(){
 const n=useNavigation<any>();const{colors}=useTheme();const[methods,setMethods]=useState<SavedPaymentMethod[]>([]);const[loading,setLoading]=useState(true);
 useEffect(()=>{void ordersPaymentsService.paymentMethods().then(r=>setMethods(r.methods)).finally(()=>setLoading(false))},[]);
 return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
  <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>n.goBack()}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>ReDom Pay</Text></View>
  <ScrollView contentContainerStyle={s.content}>
   <Text style={[s.heading,{color:colors.text}]}>Payment methods</Text>
   <Text style={[s.muted,{color:colors.textSecondary}]}>Cards used successfully through secure Paystack checkout can appear here as reusable, tokenized payment methods.</Text>
   {loading?<ActivityIndicator style={{marginTop:30}} color={colors.primary}/>:methods.length===0?<View style={[s.empty,{borderColor:colors.border,backgroundColor:colors.surface}]}><Text style={[s.emptyTitle,{color:colors.text}]}>No saved payment methods</Text><Text style={[s.muted,{color:colors.textSecondary}]}>Your first eligible card payment can securely create a reusable payment method.</Text></View>:methods.map(m=><View key={m.id} style={[s.card,{borderColor:colors.border,backgroundColor:colors.surface}]}><View style={s.row}><Text style={[s.brand,{color:colors.text}]}>{m.brand||"Card"}</Text><Text style={[s.last4,{color:colors.text}]}>{m.last4?"•••• "+m.last4:"Saved card"}</Text></View><Text style={[s.muted,{color:colors.textSecondary}]}>{m.bank||"Paystack"} · {m.currency||"—"}</Text></View>)}
  </ScrollView>
 </SafeAreaView>
}
const s=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14},title:{fontSize:19,fontWeight:"800",marginLeft:12},content:{padding:18,paddingBottom:40},heading:{fontSize:25,fontWeight:"900"},muted:{fontSize:14,lineHeight:21,marginTop:7},empty:{borderWidth:1,borderRadius:15,padding:18,marginTop:20},emptyTitle:{fontSize:18,fontWeight:"800"},card:{borderWidth:1,borderRadius:15,padding:16,marginTop:12},row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},brand:{fontSize:18,fontWeight:"800"},last4:{fontSize:16,fontWeight:"700"}});
