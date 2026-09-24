import React,{useState}from"react";
import{SafeAreaView,View,Text,Pressable,StyleSheet,TextInput,Alert}from"react-native";
import{useNavigation}from"@react-navigation/native";
import{useTheme}from"../theme/ThemeProvider";
import BackIcon from"../assets/navigation/back.svg";
import{ordersPaymentsService}from"../services/ordersPaymentsService";

export function PaymentPinScreen(){
 const n=useNavigation<any>();const{colors}=useTheme();const[pin,setPin]=useState("");const[confirm,setConfirm]=useState("");const[saving,setSaving]=useState(false);
 const save=async()=>{if(!/^\d{4,8}$/.test(pin)||pin!==confirm){Alert.alert("Payment PIN","Enter the same 4 to 8 digit PIN twice.");return}setSaving(true);try{await ordersPaymentsService.setPaymentPin(pin);Alert.alert("Payment PIN enabled","Your payment PIN is now required when payment confirmation is enabled.",[{text:"OK",onPress:()=>n.goBack()}])}catch(e){Alert.alert("Payment PIN",e instanceof Error?e.message:"Unable to save PIN.")}finally{setSaving(false)}};
 return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
  <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>n.goBack()}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>Payment PIN</Text></View>
  <View style={s.content}><Text style={[s.heading,{color:colors.text}]}>Create a payment PIN</Text><Text style={[s.muted,{color:colors.textSecondary}]}>Use 4 to 8 digits. This PIN is stored as a one-way hash and is never sent back to the app.</Text><TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={8} placeholder="New PIN" placeholderTextColor={colors.textSecondary} style={[s.input,{color:colors.text,borderColor:colors.border}]}/><TextInput value={confirm} onChangeText={setConfirm} keyboardType="number-pad" secureTextEntry maxLength={8} placeholder="Confirm PIN" placeholderTextColor={colors.textSecondary} style={[s.input,{color:colors.text,borderColor:colors.border}]}/><Pressable disabled={saving} onPress={save} style={[s.button,{backgroundColor:colors.primary}]}><Text style={s.buttonText}>{saving?"Saving…":"Save PIN"}</Text></Pressable></View>
 </SafeAreaView>
}
const s=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14},title:{fontSize:19,fontWeight:"800",marginLeft:12},content:{padding:22},heading:{fontSize:25,fontWeight:"900"},muted:{fontSize:15,lineHeight:22,marginTop:8},input:{height:54,borderWidth:1,borderRadius:13,paddingHorizontal:15,fontSize:20,marginTop:18},button:{height:54,borderRadius:27,alignItems:"center",justifyContent:"center",marginTop:22},buttonText:{color:"#fff",fontSize:17,fontWeight:"800"}});
