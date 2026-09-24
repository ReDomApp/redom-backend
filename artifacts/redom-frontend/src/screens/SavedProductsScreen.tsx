import React from "react";
import { SafeAreaView, View, Text, Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeProvider";

export function SavedProductsScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  return <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
    <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back"><Text style={[styles.back, { color: colors.text }]}>‹</Text></Pressable>
      <Text style={[styles.title, { color: colors.text }]}>Saved products</Text>
    </View>
    <View style={styles.empty}>
      <Text style={[styles.bookmark, { color: colors.textSecondary }]}>▱</Text>
      <Text style={[styles.heading, { color: colors.text }]}>Keep track of your finds</Text>
      <Text style={[styles.copy, { color: colors.textSecondary }]}>Save products that you want to see again. Only you can see your saved products.</Text>
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root:{flex:1}, header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",paddingHorizontal:14}, back:{fontSize:40,width:42}, title:{fontSize:19,fontWeight:"800"}, empty:{alignItems:"center",paddingHorizontal:35,marginTop:120}, bookmark:{fontSize:80}, heading:{fontSize:28,fontWeight:"900",textAlign:"center",marginTop:25}, copy:{fontSize:16,lineHeight:23,textAlign:"center",marginTop:12} });