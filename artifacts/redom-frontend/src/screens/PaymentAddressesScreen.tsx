import React,{useEffect,useState}from"react";
import{SafeAreaView,View,Text,Pressable,StyleSheet,ScrollView,TextInput,ActivityIndicator}from"react-native";
import{useNavigation}from"@react-navigation/native";
import{useTheme}from"../theme/ThemeProvider";
import BackIcon from"../assets/navigation/back.svg";
import{ordersPaymentsService}from"../services/ordersPaymentsService";import type{PaymentAddress}from"../services/ordersPaymentsService";

export function PaymentAddressesScreen(){
 const n=useNavigation<any>();const{colors}=useTheme();const[addresses,setAddresses]=useState<PaymentAddress[]>([]);const[q,setQ]=useState("");const[suggestions,setSuggestions]=useState<any[]>([]);const[loading,setLoading]=useState(true);
 useEffect(()=>{void ordersPaymentsService.paymentAddresses().then(r=>setAddresses(r.addresses)).finally(()=>setLoading(false))},[]);
 useEffect(()=>{const t=setTimeout(()=>{if(q.trim().length>=3)void ordersPaymentsService.addressSearch(q).then(r=>setSuggestions(r.suggestions)).catch(()=>setSuggestions([]));else setSuggestions([])},300);return()=>clearTimeout(t)},[q]);
 return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
  <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>n.goBack()}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>Addresses</Text><View style={{width:28}}/></View>
  <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
   <Text style={[s.heading,{color:colors.text}]}>Billing and shipping addresses</Text><Text style={[s.muted,{color:colors.textSecondary}]}>Search with Mapbox suggestions, then use the selected place during secure checkout.</Text>
   <TextInput value={q} onChangeText={setQ} placeholder="Search address" placeholderTextColor={colors.textSecondary} style={[s.input,{color:colors.text,borderColor:colors.border}]}/>
   {suggestions.map(x=><Pressable key={x.id} onPress={()=>{setQ(x.placeName);setSuggestions([])}} style={[s.suggestion,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={{color:colors.text}}>{x.placeName}</Text></Pressable>)}
   {loading?<ActivityIndicator style={{marginTop:25}} color={colors.primary}/>:addresses.length===0?<Text style={[s.empty,{color:colors.textSecondary}]}>No saved payment addresses yet.</Text>:addresses.map(a=><View key={a.id} style={[s.card,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[s.name,{color:colors.text}]}>{a.full_name}</Text><Text style={[s.muted,{color:colors.textSecondary}]}>{a.address_line1}{a.address_line2?" · "+a.address_line2:""}</Text><Text style={[s.muted,{color:colors.textSecondary}]}>{a.city}{a.state?", "+a.state:""} {a.postal_code||""}</Text><Text style={[s.muted,{color:colors.textSecondary}]}>{a.country_name}</Text></View>)}
  </ScrollView>
 </SafeAreaView>
}
const s=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14},title:{fontSize:20,fontWeight:"800"},content:{padding:18,paddingBottom:40},heading:{fontSize:24,fontWeight:"900"},muted:{fontSize:14,lineHeight:21,marginTop:6},input:{height:54,borderWidth:1,borderRadius:13,paddingHorizontal:14,fontSize:16,marginTop:18},suggestion:{padding:14,borderWidth:1,borderRadius:11,marginTop:7},card:{borderWidth:1,borderRadius:14,padding:15,marginTop:12},name:{fontSize:17,fontWeight:"800"},empty:{fontSize:16,textAlign:"center",marginTop:28}});
