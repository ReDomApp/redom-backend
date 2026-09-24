import { useTheme } from "../theme/ThemeProvider";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { GroupActionIcon } from "../components/GroupActionIcon";

type Props = NativeStackScreenProps<RootStackParamList, "GroupPrivacyInfo">;

export function GroupPrivacyInfoScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  return <SafeAreaView style={s.root}>
    <View style={s.header}>
      <Pressable onPress={() => navigation.goBack()}><GroupActionIcon kind="close" size={28} color="#111" /></Pressable>
      <View style={s.handle} />
      <View style={{ width: 28 }} />
    </View>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.illustration}><GroupActionIcon kind="privacy" size={78} color="#22A96B" /></View>
      <Text style={s.title}>All chats are private by default</Text>
      <Text style={s.subtitle}>Your personal messages are always protected with end-to-end encryption.</Text>
      <Bullet icon="blocked" text="ReDom AI can't access your chats. It can only read messages you explicitly choose to send to it." />
      <Bullet icon="settings" text="This protection applies whether advanced chat privacy is ON or OFF." />
      <View style={s.footer}>
        <Pressable style={s.primary} onPress={() => navigation.goBack()}><Text style={s.primaryText}>Got it</Text></Pressable>
        <Pressable onPress={() => navigation.navigate("Policy", { slug: "messaging" })}><Text style={s.learn}>Learn more</Text></Pressable>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function Bullet({ icon, text }: { icon: any; text: string }) { const { colors } = useTheme(); const s = makeStyles(colors); return <View style={s.bullet}><GroupActionIcon kind={icon} size={28} color="#22A96B" /><Text style={s.bulletText}>{text}</Text></View>; }

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) { return StyleSheet.create({
  root:{flex:1,backgroundColor:colors.surface},header:{height:64,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:18},handle:{width:62,height:6,borderRadius:3,backgroundColor:"#98A2B3"},content:{paddingHorizontal:28,paddingTop:22,paddingBottom:42,alignItems:"center"},illustration:{height:150,width:190,alignItems:"center",justifyContent:"center",backgroundColor:colors.surfaceSecondary,borderRadius:30,marginBottom:30},title:{fontSize:30,lineHeight:37,fontWeight:"700",color:colors.text,textAlign:"center"},subtitle:{fontSize:17,lineHeight:25,color:colors.textSecondary,textAlign:"center",marginTop:18},bullet:{width:"100%",flexDirection:"row",alignItems:"flex-start",gap:18,marginTop:28},bulletText:{flex:1,fontSize:17,lineHeight:27,color:colors.text},footer:{width:"100%",marginTop:34,alignItems:"center"},primary:{width:"100%",minHeight:56,borderRadius:30,backgroundColor:"#22A96B",alignItems:"center",justifyContent:"center"},primaryText:{color:"#FFF",fontSize:18,fontWeight:"700"},learn:{marginTop:24,fontSize:17,fontWeight:"700",color:"#218B67"}
}); }