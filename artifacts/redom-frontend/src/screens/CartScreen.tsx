import React from "react";
import { SafeAreaView, View, Text, Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeProvider";
import BackIcon from "../assets/navigation/back.svg";
import CartIcon from "../assets/home-feed/cart.svg";

export function CartScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  return <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
    <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back" style={styles.button}><BackIcon width={24} height={24}/></Pressable>
      <Text style={[styles.title, { color: colors.text }]}>Cart</Text>
      <View style={{ width: 34 }} />
    </View>
    <View style={styles.empty}>
      <CartIcon width={64} height={64} color={colors.textSecondary}/>
      <Text style={[styles.heading, { color: colors.text }]}>Add to your cart</Text>
      <Text style={[styles.copy, { color: colors.textSecondary }]}>Now you can buy items from supported ReDom brands without leaving ReDom.</Text>
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root:{flex:1}, header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14}, button:{width:34,height:34,alignItems:"center",justifyContent:"center"},  title:{fontSize:19,fontWeight:"800",flex:1,textAlign:"center"}, empty:{alignItems:"center",paddingHorizontal:35,marginTop:115},  heading:{fontSize:28,fontWeight:"900",marginTop:24}, copy:{fontSize:16,lineHeight:23,textAlign:"center",marginTop:12} });