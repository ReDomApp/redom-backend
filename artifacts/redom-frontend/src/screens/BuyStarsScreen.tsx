import React,{useEffect,useState}from"react";
import{SafeAreaView,View,Text,Pressable,StyleSheet,ScrollView,ActivityIndicator}from"react-native";
import{useNavigation}from"@react-navigation/native";
import{useTheme}from"../theme/ThemeProvider";
import{ordersPaymentsService}from"../services/ordersPaymentsService";import type{StarCountry,StarPackage}from"../services/ordersPaymentsService";
import BackIcon from"../assets/navigation/back.svg";

export function BuyStarsScreen(){
 const n=useNavigation<any>();const{colors}=useTheme();
 const[countries,setCountries]=useState<StarCountry[]>([]);const[packages,setPackages]=useState<StarPackage[]>([]);
 const[country,setCountry]=useState<StarCountry|null>(null);const[loading,setLoading]=useState(true);
 useEffect(()=>{void ordersPaymentsService.starsCatalog().then(r=>{setCountries(r.countries);setPackages(r.packages)}).finally(()=>setLoading(false))},[]);
 const choose=(c:StarCountry)=>{setCountry(c);void ordersPaymentsService.starsCatalog(c.isoCode).then(r=>setPackages(r.packages))};
 return <SafeAreaView style={[s.root,{backgroundColor:colors.background}]}>
  <View style={[s.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}><Pressable onPress={()=>n.goBack()}><BackIcon width={24} height={24}/></Pressable><Text style={[s.title,{color:colors.text}]}>Buy ReDom Stars</Text></View>
  <ScrollView contentContainerStyle={s.content}>
   <Text style={[s.heading,{color:colors.text}]}>Choose your country first</Text>
   <Text style={[s.sub,{color:colors.textSecondary}]}>This determines the currency and payment options available for your purchase.</Text>
   {loading?<ActivityIndicator color={colors.primary}/>:countries.map(c=><Pressable key={c.isoCode} onPress={()=>choose(c)} style={[s.country,{backgroundColor:colors.surface,borderColor:country?.isoCode===c.isoCode?colors.primary:colors.border}]}><Text style={[s.countryName,{color:colors.text}]}>{c.name}</Text><Text style={{color:colors.textSecondary}}>{c.currency}</Text></Pressable>)}
   {country?<><Text style={[s.heading,{color:colors.text,marginTop:24}]}>Choose Stars</Text>{packages.map(p=><Pressable key={p.key} onPress={()=>n.navigate("StarsCheckout",{packageKey:p.key,countryCode:country.isoCode})} style={[s.package,{backgroundColor:colors.surface,borderColor:p.popular?colors.primary:colors.border}]}><View style={{flex:1}}>{p.popular?<View style={[s.badge,{backgroundColor:colors.primary}]}><Text style={s.badgeText}>MOST POPULAR</Text></View>:null}<Text style={[s.stars,{color:colors.text}]}>{p.stars.toLocaleString()} Stars</Text>{p.firstPurchaseUsdPrice!=null&&p.usdPrice<p.regularUsdPrice?<View style={s.priceRow}><Text style={[s.oldPrice,{color:colors.textSecondary}]}>$ {p.regularUsdPrice.toFixed(2)}</Text><Text style={[s.discount,{color:colors.primary}]}>{p.firstPurchaseDiscountPercent}% OFF</Text></View>:null}<Text style={{color:colors.textSecondary}}>USD {p.usdPrice.toFixed(2)}</Text></View><Text style={[s.price,{color:colors.text}]}>{p.localAmountFormatted}</Text></Pressable>)}</>:null}
  </ScrollView>
 </SafeAreaView>
}
const s=StyleSheet.create({root:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14},title:{fontSize:19,fontWeight:"800",marginLeft:12},content:{padding:20,paddingBottom:50},heading:{fontSize:24,fontWeight:"900",marginBottom:7},sub:{fontSize:15,lineHeight:22,marginBottom:16},country:{padding:16,borderWidth:1,borderRadius:14,marginBottom:9,flexDirection:"row",justifyContent:"space-between"},countryName:{fontSize:17,fontWeight:"700"},package:{padding:17,borderWidth:1,borderRadius:16,marginBottom:10,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},stars:{fontSize:18,fontWeight:"800"},price:{fontSize:17,fontWeight:"800"},badge:{alignSelf:"flex-start",paddingHorizontal:9,paddingVertical:5,borderRadius:999,marginBottom:7},badgeText:{color:"#fff",fontSize:10,fontWeight:"900",letterSpacing:.5},priceRow:{flexDirection:"row",alignItems:"center",gap:8},oldPrice:{fontSize:13,textDecorationLine:"line-through"},discount:{fontSize:12,fontWeight:"900"}});