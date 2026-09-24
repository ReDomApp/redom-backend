import { Image, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { useAuthContext } from "../auth/context";
import { useTheme, type ThemeMode } from "../theme/ThemeProvider";

const OPTIONS:Array<{value:ThemeMode;title:string;description?:string}>=[
 {value:"dark",title:"On"},
 {value:"light",title:"Off"},
 {value:"system",title:"Use system settings",description:"We’ll adjust your appearance based on your device’s system settings."},
];

export function DarkModeScreen(){
 const navigation=useNavigation<NativeStackNavigationProp<RootStackParamList>>(); const {user}=useAuthContext(); const {mode,colors,setTheme}=useTheme();
 const choose=async(value:ThemeMode)=>{if(value!==mode)await setTheme(value);};
 return <SafeAreaView style={[styles.root,{backgroundColor:colors.surface}]}>
  <View style={[styles.header,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}>
   <Pressable style={styles.backButton} onPress={()=>navigation.goBack()}><Text style={[styles.back,{color:colors.text}]}>‹</Text></Pressable>
   <Text style={[styles.title,{color:colors.text}]}>Dark mode</Text>
   <View style={styles.headerRight}><Text style={[styles.search,{color:colors.text}]}>⌕</Text>{user?.profilePhoto?<Image source={{uri:user.profilePhoto}} style={styles.avatar}/>:<View style={[styles.avatarFallback,{backgroundColor:colors.primary}]}><Text style={styles.avatarLetter}>{user?.firstName?.[0]??"R"}</Text></View>}<Text style={[styles.down,{color:colors.textSecondary}]}>⌄</Text></View>
  </View>
  <View style={[styles.content,{backgroundColor:colors.surface}]}>
   {OPTIONS.map(o=><Pressable key={o.value} style={styles.option} onPress={()=>void choose(o.value)} accessibilityRole="radio" accessibilityState={{selected:mode===o.value}}>
    <View style={styles.copy}><Text style={[styles.optionTitle,{color:colors.text}]}>{o.title}</Text>{o.description?<Text style={[styles.description,{color:colors.textSecondary}]}>{o.description}</Text>:null}</View>
    <View style={[styles.radio,{borderColor:mode===o.value?colors.primary:colors.textSecondary}]}>{mode===o.value?<View style={[styles.radioDot,{backgroundColor:colors.primary}]}/>:null}</View>
   </Pressable>)}
  </View>
 </SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1},header:{height:58,flexDirection:"row",alignItems:"center",paddingHorizontal:14,borderBottomWidth:1},backButton:{width:44,height:44,justifyContent:"center"},back:{fontSize:40,lineHeight:42,fontWeight:"300"},title:{flex:1,textAlign:"center",fontSize:20,fontWeight:"800"},headerRight:{width:112,flexDirection:"row",alignItems:"center",justifyContent:"flex-end"},search:{fontSize:38,lineHeight:40,marginRight:12,fontWeight:"300"},avatar:{width:38,height:38,borderRadius:19},avatarFallback:{width:38,height:38,borderRadius:19,alignItems:"center",justifyContent:"center"},avatarLetter:{color:"#FFFFFF",fontSize:18,fontWeight:"700"},down:{fontSize:19,marginLeft:-4,marginTop:-8},content:{flex:1,paddingTop:2},option:{minHeight:82,paddingHorizontal:23,paddingVertical:13,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},copy:{flex:1,paddingRight:18},optionTitle:{fontSize:18,lineHeight:24,fontWeight:"700"},description:{marginTop:2,fontSize:16,lineHeight:23,maxWidth:520},radio:{width:40,height:40,borderRadius:20,borderWidth:3,alignItems:"center",justifyContent:"center"},radioDot:{width:26,height:26,borderRadius:13}});
