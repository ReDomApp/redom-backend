import React,{useState}from"react";
import{SafeAreaView,View,Text,Pressable,StyleSheet,TextInput}from"react-native";
import{useNavigation,useRoute}from"@react-navigation/native";
import{useTheme}from"../theme/ThemeProvider";
import BackIcon from"../assets/navigation/back.svg";

export function StarsCheckoutScreen(){
 const n=useNavigation<any>();const route=useRoute<any>();const{colors}=useTheme();const[email,setEmail]=useState("");
 return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
  <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>n.goBack()}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>Pay for ReDom Stars?</Text></View>
  <View style={s.content}><Text style={[s.heading,{color:colors.text}]}>Confirm your purchase</Text><Text style={[s.muted,{color:colors.textSecondary}]}>Package: {route.params.packageKey}</Text><Text style={[s.muted,{color:colors.textSecondary}]}>Country: {route.params.countryCode}</Text><Text style={[s.label,{color:colors.text}]}>Email for transaction updates</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={colors.textSecondary} style={[s.input,{color:colors.text,borderColor:colors.border,backgroundColor:colors.surface}]}/><Pressable style={[s.button,{backgroundColor:colors.primary}]}><Text style={s.buttonText}>Continue</Text></Pressable></View>
 </SafeAreaView>
}
const s=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14},title:{fontSize:18,fontWeight:"800",marginLeft:12},content:{padding:22},heading:{fontSize:25,fontWeight:"900",marginBottom:12},muted:{fontSize:16,marginBottom:7},label:{fontSize:16,fontWeight:"700",marginTop:24,marginBottom:8},input:{height:54,borderWidth:1,borderRadius:13,paddingHorizontal:15,fontSize:16},button:{height:54,borderRadius:27,alignItems:"center",justifyContent:"center",marginTop:24},buttonText:{color:"#fff",fontSize:17,fontWeight:"800"}});