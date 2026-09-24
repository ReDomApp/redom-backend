import React,{useEffect,useState}from"react";
import{SafeAreaView,View,Text,Pressable,StyleSheet,ActivityIndicator,ScrollView}from"react-native";
import{useNavigation}from"@react-navigation/native";
import{useTheme}from"../theme/ThemeProvider";
import{ordersPaymentsService}from"../services/ordersPaymentsService";
import BackIcon from"../assets/navigation/back.svg";
import StarsIcon from"../assets/home-feed/stars.svg";

export function StarsActivityScreen(){
 const navigation=useNavigation<any>();const{colors}=useTheme();const[loading,setLoading]=useState(true);const[balance,setBalance]=useState(0);const[activity,setActivity]=useState<any[]>([]);
 useEffect(()=>{void ordersPaymentsService.starsActivity().then(r=>{setBalance(r.balance);setActivity(r.activity)}).finally(()=>setLoading(false))},[]);
 return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
  <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>navigation.goBack()}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>ReDom Stars</Text></View>
  {loading?<ActivityIndicator color={colors.primary} style={s.loader}/>:<ScrollView contentContainerStyle={s.content}>
   <View style={[s.balance,{backgroundColor:colors.surface,borderColor:colors.border}]}><StarsIcon width={46} height={46} color={colors.text}/><Text style={[s.label,{color:colors.textSecondary}]}>Total balance</Text><Text style={[s.number,{color:colors.text}]}>{balance.toLocaleString()} Stars</Text><Pressable onPress={()=>navigation.navigate("BuyStars")} style={[s.buy,{backgroundColor:colors.primary}]}><Text style={s.buyText}>Buy Stars</Text></Pressable></View>
   <Text style={[s.heading,{color:colors.text}]}>Recent transactions</Text>
   {!activity.length?<Text style={[s.empty,{color:colors.textSecondary}]}>You don't have any pending or completed Star transactions.</Text>:activity.map(x=><View key={x.id} style={[s.row,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={{flex:1}}><Text style={[s.rowTitle,{color:colors.text}]}>{x.type==="purchase"?"Purchased "+x.stars+" Stars":x.type}</Text><Text style={{color:colors.textSecondary}}>{new Date(x.createdAt).toLocaleString()}</Text></View><Text style={[s.stars,{color:colors.text}]}>{x.stars>0?"+":""}{x.stars}</Text></View>)}
  </ScrollView>}
 </SafeAreaView>
}
const s=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14},title:{fontSize:19,fontWeight:"800",marginLeft:12},content:{padding:20,paddingBottom:50},balance:{borderWidth:1,borderRadius:18,padding:22,alignItems:"center"},label:{fontSize:15,marginTop:12},number:{fontSize:32,fontWeight:"900",marginTop:5},buy:{marginTop:20,minWidth:180,height:50,borderRadius:25,alignItems:"center",justifyContent:"center"},buyText:{color:"#fff",fontSize:17,fontWeight:"800"},heading:{fontSize:21,fontWeight:"900",marginTop:28,marginBottom:10},empty:{fontSize:15,lineHeight:22},row:{borderWidth:1,borderRadius:14,padding:15,marginBottom:9,flexDirection:"row",alignItems:"center"},rowTitle:{fontSize:16,fontWeight:"700",marginBottom:4},stars:{fontSize:16,fontWeight:"800"},loader:{marginTop:30}});